"""Defences against prompt injection and implausible AI output.

The visitor's text reaches a language model, and the model's text reaches a
public page. Neither is trusted. Layers, from input to output:

1. service.text.clean_visitor_text - normalise Unicode, strip control,
   zero-width and bidi-override characters and fence markers, collapse
   whitespace. Applied by the request schema, before anything else sees it.
2. The prompt - visitor text is fenced between markers it cannot reproduce,
   and the model is told the text is data, not instructions
   (service.estimator).
3. is_product - the model must say whether the text describes a physical
   product or material; if not, no estimate is produced (service.app).
4. sanitize_decomposition - on the way out: hidden characters stripped, links
   and e-mail addresses removed, every text field and list capped, absurd line
   counts and service lives rejected.
5. check_line_bounds - quantities and factors outside physically plausible
   ranges are excluded from the calculation and listed, never counted.

What cannot be injected regardless of the model's output:
  - totals, shares and ranges: computed by ghg_core from validated lines
  - "verified" provenance: decided server-side from the registry
  - extra fields: the output schema forbids them
  - HTML or script: the page renders all text as text (no innerHTML anywhere)
"""
from __future__ import annotations

from decimal import Decimal

from .estimator import EstimatorInvalidOutput
from .schemas import AILine, Decomposition
from .text import clean_output_text

MAX_LINES = 30
MAX_LIST_ITEMS = 5
SHORT, MEDIUM, LONG = 160, 400, 900

# Plausibility bounds. Deliberately generous: SF6 is about 25,000 kgCO2e per kg
# on a 100-year basis, and a ship can contain millions of kg of steel. These catch
# absurd values (injected or hallucinated), not unusual real ones.
MAX_QUANTITY = Decimal("10000000")
MAX_FACTOR_PER_UNIT = Decimal("50000")
MAX_SERVICE_LIFE_YEARS = Decimal("200")


def sanitize_decomposition(d: Decomposition) -> Decomposition:
    """A copy of the model's output that is safe and bounded to display."""
    if len(d.lines) > MAX_LINES:
        raise EstimatorInvalidOutput(
            f"The analysis had {len(d.lines)} lines, more than the {MAX_LINES} allowed.")
    life = d.assumptions.service_life_years
    if life < 0 or life > MAX_SERVICE_LIFE_YEARS:
        raise EstimatorInvalidOutput("The analysis assumed an implausible service life.")

    def items(xs: list[str]) -> list[str]:
        return [clean_output_text(x, MEDIUM) for x in xs[:MAX_LIST_ITEMS]]

    return d.model_copy(update={
        "product": d.product.model_copy(update={
            "interpreted_as": clean_output_text(d.product.interpreted_as, SHORT),
            "declared_unit": clean_output_text(d.product.declared_unit, SHORT),
            "clarification": clean_output_text(d.product.clarification, MEDIUM),
        }),
        "assumptions": d.assumptions.model_copy(update={
            "region": clean_output_text(d.assumptions.region, SHORT),
            "use_profile": clean_output_text(d.assumptions.use_profile, MEDIUM),
            "end_of_life_route": clean_output_text(d.assumptions.end_of_life_route, MEDIUM),
        }),
        "lines": [ln.model_copy(update={
            "component": clean_output_text(ln.component, SHORT),
            "factor_basis": clean_output_text(ln.factor_basis, SHORT),
            "reference": clean_output_text(ln.reference, SHORT),
            "catalogue_key": clean_output_text(ln.catalogue_key, SHORT),
            "production_route": clean_output_text(ln.production_route, SHORT),
        }) for ln in d.lines],
        "analysis": d.analysis.model_copy(update={
            "summary": clean_output_text(d.analysis.summary, LONG),
            "creation_drivers": items(d.analysis.creation_drivers),
            "use_phase_drivers": items(d.analysis.use_phase_drivers),
            "data_gaps": items(d.analysis.data_gaps),
            "reduction_opportunities": [o.model_copy(update={
                "lever": clean_output_text(o.lever, SHORT),
                "rationale": clean_output_text(o.rationale, MEDIUM),
            }) for o in d.analysis.reduction_opportunities[:MAX_LIST_ITEMS]],
        }),
    })


def check_line_bounds(line: AILine) -> None:
    """Raise ValueError for a physically implausible line; the pipeline excludes it."""
    if line.quantity > MAX_QUANTITY:
        raise ValueError(f"quantity {line.quantity} {line.quantity_unit} is outside the "
                         f"plausible range, so this input was left out.")
    if line.factor_high > MAX_FACTOR_PER_UNIT:
        raise ValueError(f"emission factor above {MAX_FACTOR_PER_UNIT} kgCO2e per "
                         f"{line.quantity_unit} is outside the plausible range, so this "
                         f"input was left out.")
