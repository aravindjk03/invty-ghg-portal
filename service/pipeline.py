"""Join the AI's lifecycle lines to ghg_core.

  Decomposition (AI)  ->  ScreeningLine[]  ->  ghg_core.screen_product  ->  EstimateResponse

Two things happen on the way in:

1. A line the AI mapped onto a catalogue material is looked up in the verified
   factor registry. If a verified factor resolves on a compatible unit, it
   REPLACES the AI's factor and the line is marked verified_registry. Today the
   registry is empty by design, so every line stays an AI estimate - but the
   moment ingestion lands, estimates upgrade without any change here.

2. A line that fails validation (inverted range, negative factor, unknown
   unit) is EXCLUDED and listed with its reason. It is never silently repaired
   and never counted.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from ghg_core import ENGINE_VERSION, GhgCoreError, InMemoryFactorRegistry, round_sig
from ghg_core.factors import CRADLE_TO_GATE, PCF_PREFIX
from ghg_core.screening import (AI_ESTIMATE, VERIFIED_REGISTRY, Range,
                                ScreeningLine, screen_product)

from .catalogue import Catalogue
from .guard import check_line_bounds, sanitize_decomposition
from .schemas import (AILine, Decomposition, DisplayRange, EstimateRequest,
                      EstimateResponse, ExcludedLine, LineOut, Method, RangeOut,
                      Totals)

KG_PER_TONNE = Decimal(1000)

# Commercial LCA databases INVTY holds no licence for. A public page must not
# attribute a figure to them, even as an unverified AI citation.
NON_REDISTRIBUTABLE_SOURCES = ("ecoinvent", "gabi", "sphera")


def _publishable_reference(reference: str) -> str:
    """Drop an AI citation that names a non-redistributable database. The line
    stays an AI estimate; it simply shows no source rather than an unlicensed one."""
    lowered = reference.lower()
    return "" if any(name in lowered for name in NON_REDISTRIBUTABLE_SOURCES) else reference


def _plain(d: Decimal) -> str:
    """Exact value as a plain string - never scientific notation."""
    s = format(d, "f")
    return s.rstrip("0").rstrip(".") if "." in s else s


def _sig(d: Decimal) -> str:
    """Three significant figures for DISPLAY. A screening estimate shown as
    1,616.4372 is false precision."""
    return _plain(round_sig(d, 3))


def _emissions_out(r: Range) -> RangeOut:
    """kgCO2e, with a display unit of t once the central value reaches 1 t."""
    use_tonnes = r.central >= KG_PER_TONNE
    scale, unit = (KG_PER_TONNE, "tCO2e") if use_tonnes else (Decimal(1), "kgCO2e")
    return RangeOut(
        low=_plain(r.low), central=_plain(r.central), high=_plain(r.high),
        display=DisplayRange(low=_sig(r.low / scale), central=_sig(r.central / scale),
                             high=_sig(r.high / scale), unit=unit))


def _factor_out(line: ScreeningLine) -> RangeOut:
    return RangeOut(
        low=_plain(line.factor_low), central=_plain(line.factor_central),
        high=_plain(line.factor_high),
        display=DisplayRange(low=_sig(line.factor_low), central=_sig(line.factor_central),
                             high=_sig(line.factor_high),
                             unit=f"kgCO2e/{line.quantity_unit}"))


def _pct(share: Optional[Decimal]) -> Optional[str]:
    return None if share is None else _sig(share * 100)


def _verified_factor(ai: AILine, catalogue: Catalogue, registry: InMemoryFactorRegistry,
                     region: str, year: int):
    """A verified registry factor for this line, or None. Never raises."""
    if not ai.catalogue_key.startswith(PCF_PREFIX):
        return None
    if not catalogue.matches(ai.catalogue_key, ai.production_route):
        return None
    try:
        res = registry.resolve(ai.catalogue_key, region, year, "CO2",
                               production_route=ai.production_route,
                               system_boundary=CRADLE_TO_GATE)
    except GhgCoreError:
        return None
    f = res.factor
    if f.denominator_unit != ai.quantity_unit or f.numerator_unit != "kgCO2e":
        return None          # a unit mismatch keeps the estimate rather than guess a conversion
    return res


def build_lines(decomp: Decomposition, catalogue: Catalogue,
                registry: InMemoryFactorRegistry, region: str, year: int):
    lines: list[ScreeningLine] = []
    keys: dict[str, AILine] = {}
    excluded: list[ExcludedLine] = []

    for i, ai in enumerate(decomp.lines, start=1):
        line_id = f"L{i:02d}"
        verified = _verified_factor(ai, catalogue, registry, region, year)
        try:
            check_line_bounds(ai)
            if verified is not None:
                f = verified.factor
                spread = (f.value * f.uncertainty_pct / 100) if f.uncertainty_pct else Decimal(0)
                line = ScreeningLine(
                    line_id=line_id, stage=ai.stage, component=ai.component,
                    quantity=ai.quantity, quantity_unit=ai.quantity_unit,
                    factor_low=max(f.value - spread, Decimal(0)),
                    factor_central=f.value, factor_high=f.value + spread,
                    provenance=VERIFIED_REGISTRY, factor_basis=f.source_name,
                    reference=f.source_table_ref, factor_version_id=f.version_id,
                    tier=f.tier)
            else:
                line = ScreeningLine(
                    line_id=line_id, stage=ai.stage, component=ai.component,
                    quantity=ai.quantity, quantity_unit=ai.quantity_unit,
                    factor_low=ai.factor_low, factor_central=ai.factor_central,
                    factor_high=ai.factor_high, provenance=AI_ESTIMATE,
                    factor_basis=ai.factor_basis,
                    reference=_publishable_reference(ai.reference))
        except ValueError as exc:
            excluded.append(ExcludedLine(component=ai.component, stage=ai.stage,
                                         reason=str(exc)))
            continue
        lines.append(line)
        keys[line_id] = ai
    return lines, keys, excluded


def _estimate_id(request: EstimateRequest, lines: list[ScreeningLine]) -> str:
    payload = json.dumps({
        "engine": ENGINE_VERSION,
        "request": request.model_dump(),
        "lines": [[l.stage, l.component, str(l.quantity), l.quantity_unit,
                   str(l.factor_low), str(l.factor_central), str(l.factor_high),
                   l.provenance] for l in lines],
    }, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def build_response(request: EstimateRequest, decomp: Decomposition, catalogue: Catalogue,
                   registry: InMemoryFactorRegistry, *, year: int, assistant: str,
                   cache_hit: bool = False,
                   now: Optional[datetime] = None) -> EstimateResponse:
    # Idempotent: output from any path, including older cache entries, is made
    # safe to display before anything is built from it.
    decomp = sanitize_decomposition(decomp)
    lines, ai_by_id, excluded = build_lines(decomp, catalogue, registry, request.region, year)
    result = screen_product(lines)

    line_out = []
    for lr in result.lines:
        ai = ai_by_id[lr.line.line_id]
        # A hallucinated key, or a real key on the wrong route, is not shown as
        # a mapping. A verified line always passed this check to get verified.
        mapped = catalogue.matches(ai.catalogue_key, ai.production_route)
        line_out.append(LineOut(
            line_id=lr.line.line_id, stage=lr.line.stage, component=lr.line.component,
            quantity=_plain(lr.line.quantity), quantity_unit=lr.line.quantity_unit,
            factor=_factor_out(lr.line), emissions=_emissions_out(lr.emissions),
            share_of_lifecycle_pct=_pct(lr.share_of_lifecycle),
            provenance=lr.line.provenance, tier=lr.line.tier,
            factor_version_id=lr.line.factor_version_id,
            factor_basis=lr.line.factor_basis, reference=lr.line.reference,
            catalogue_key=ai.catalogue_key if mapped else "",
            production_route=ai.production_route if mapped else ""))

    return EstimateResponse(
        estimate_id=_estimate_id(request, lines),
        request=request,
        product=decomp.product,
        assumptions=decomp.assumptions,
        totals=Totals(creation=_emissions_out(result.creation),
                      use=_emissions_out(result.use),
                      end_of_life=_emissions_out(result.end_of_life),
                      lifecycle=_emissions_out(result.lifecycle)),
        stages={s: _emissions_out(r) for s, r in result.stages.items()},
        stage_shares_pct={s: _pct(v) for s, v in result.stage_shares.items()},
        lines=line_out,
        hotspot_line_ids=[h.line.line_id for h in result.hotspots],
        verified_share_pct=_pct(result.verified_share),
        excluded=excluded,
        analysis=decomp.analysis,
        method=Method(assistant=assistant, engine_version=ENGINE_VERSION,
                      generated_at=(now or datetime.now(timezone.utc)).isoformat(),
                      reporting_year=year, cache_hit=cache_hit),
    )
