"""HTTP contract for the organisation inventory.

The browser sends activity records and the GWP set the customer reports on;
this returns the calculation from ghg_core, gas by gas, with the provenance of
every factor. There is no second engine and no fallback arithmetic: if a factor
or a unit cannot be resolved, the line comes back unavailable with the reason,
and the totals leave it out.
"""
from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from ghg_core.engine import ActivityRecord, CalculationRun
from ghg_core.factors import EmissionFactor
from ghg_core.quantities import D

from .inventory import (GWP_SETS, SUPPLIED_PREFIX, activities_for, load_catalogue_map,
                        run_inventory, supplied_factor, wtt_counterparts)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


# --- request ----------------------------------------------------------------

class InventoryRecord(_Strict):
    record_id: str = Field(min_length=1, max_length=64)
    activity_key: str = Field(min_length=1, max_length=200)
    scope: Literal["1", "2", "3", "memo"]
    ghg_category: str = Field(min_length=1, max_length=16)
    region: str = Field(min_length=2, max_length=8)
    value: Optional[Decimal] = None
    unit: Optional[str] = Field(default=None, max_length=32)
    facility_id: Optional[str] = Field(default=None, max_length=120)
    scope2_view: Optional[Literal["location", "market"]] = None
    period_month: Optional[str] = Field(default=None, max_length=7)
    note: str = Field(default="", max_length=400)

    # A factor the reporting company provides for this row: a power purchase
    # agreement, a green tariff, a retired certificate, a supplier's EPD. The
    # GHG Protocol's Scope 2 Guidance requires the contractual rate for a
    # market-based figure, so this is the correct answer there rather than a
    # workaround. It is accepted only WITH a citation - an unsourced number is
    # indistinguishable from an invented one.
    supplied_factor: Optional[Decimal] = Field(default=None, ge=0)
    supplied_factor_unit: Optional[str] = Field(default=None, max_length=32)
    supplied_factor_source: str = Field(default="", max_length=300)


class InventoryRequest(_Strict):
    records: list[InventoryRecord] = Field(default_factory=list, max_length=5000)
    gwp_set: Literal["AR5", "AR6"] = "AR5"
    reporting_year: int = Field(ge=1990, le=2100)
    scope2_view: Literal["location", "market"] = "location"

    # Category 3 includes the electricity lost between the power station and
    # the meter. The rate is a published figure for the grid or the utility -
    # it varies several-fold across India - so it is the customer's to give,
    # with the source, rather than a number this service invents.
    td_loss_rate: Optional[Decimal] = Field(default=None, ge=0, lt=1)
    td_loss_rate_source: str = Field(default="", max_length=300)

    # The upstream emissions of purchased electricity: the fuel burned to
    # generate it, before it reaches the grid. No set publishes this for India,
    # so a company that holds a figure gives it here, with its source, and the
    # line is worked out for them. In kgCO2e per kWh.
    electricity_wtt_factor: Optional[Decimal] = Field(default=None, ge=0)
    electricity_wtt_source: str = Field(default="", max_length=300)


# --- response ---------------------------------------------------------------

class LineOut(_Strict):
    record_id: str
    activity_key: str
    scope: str
    ghg_category: str
    status: str
    message: str
    emissions_kgco2e: str
    gas_breakdown: dict[str, str]
    gwp_applied: dict[str, str]
    factor_value: Optional[str]
    #: What the factor is per, so a report can say "per litre" beside it.
    factor_unit: Optional[str]
    #: Emissions per unit of activity across every gas: the number that
    #: multiplies out to the figure in the tCO2e column.
    effective_factor: Optional[str]
    factor_source: Optional[str]
    factor_reference_year: Optional[int]
    factor_version_id: Optional[str]
    resolution_flags: list[str]
    data_quality_tier: str


class TotalsOut(_Strict):
    scope1: str
    scope2_location: str
    scope2_market: str
    scope2_headline: str
    scope3: str
    scope3_by_category: dict[str, str]
    total_scope12: str
    total_all: str
    memo: dict[str, str]


class DerivedOut(_Strict):
    """One Category 3 line this service worked out rather than being told."""
    record_id: str
    from_record_id: str
    kind: str
    basis: str


class NotDerivedOut(_Strict):
    """A Category 3 line that could NOT be worked out, and why."""
    from_record_id: str
    kind: str
    reason: str


class InventoryResponse(_Strict):
    run_id: str
    engine_version: str
    gwp_set: str
    gwp_source: str
    scope2_view: str
    reporting_year: int
    lines: list[LineOut]
    totals: TotalsOut
    excluded: list[dict]
    #: Category 3 lines derived from the Scope 1 and Scope 2 rows, and the ones
    #: that could not be. Both are reported: a category that silently covers
    #: some of its sources is worse than one that says which.
    derived: list[DerivedOut] = Field(default_factory=list)
    not_derived: list[NotDerivedOut] = Field(default_factory=list)


class CatalogueMappingOut(_Strict):
    catalogue_key: str
    catalogue_name: str
    unit: str
    activity_key: str
    engine_name: str
    region: str
    source: str


class ActivityOut(_Strict):
    activity_key: str
    name: str
    scope: str
    category_path: str
    unit: str
    #: Every basis this activity is published on, so the picker can offer them.
    units: list[str]
    region: str
    source: str
    reference_year: int
    gases: list[str]


def to_records(request: InventoryRequest) -> list[ActivityRecord]:
    return [
        ActivityRecord(
            record_id=item.record_id,
            # A row carrying its own factor is filed under a key of its own, so
            # one company's contract rate can never be resolved for another row.
            activity_key=(f"{SUPPLIED_PREFIX}{item.record_id}"
                          if item.supplied_factor is not None else item.activity_key),
            scope=item.scope,
            ghg_category=item.ghg_category,
            region=item.region,
            value=item.value,
            unit=item.unit,
            facility_id=item.facility_id,
            scope2_view=item.scope2_view,
            note=item.note,
        )
        for item in request.records
    ]


def to_response(run: CalculationRun, request: InventoryRequest, gwp_source: str) -> InventoryResponse:
    totals = run.totals
    as_text = lambda value: str(value)  # noqa: E731 - Decimal crosses the wire as text

    return InventoryResponse(
        run_id=run.run_id,
        engine_version=run.engine_version,
        gwp_set=run.gwp_set_name,
        gwp_source=gwp_source,
        scope2_view=run.scope2_headline_view,
        reporting_year=request.reporting_year,
        lines=[
            LineOut(
                record_id=line.record_id,
                activity_key=line.activity_key,
                scope=line.scope,
                ghg_category=line.ghg_category,
                status=line.status,
                message=line.message,
                emissions_kgco2e=as_text(line.emissions_kgco2e),
                gas_breakdown={gas: as_text(value) for gas, value in line.gas_breakdown.items()},
                gwp_applied={gas: as_text(value) for gas, value in line.gwp_applied.items()},
                factor_value=None if line.factor_value is None else as_text(line.factor_value),
                factor_unit=line.factor_unit,
                effective_factor=(None if line.effective_factor is None
                                  else as_text(line.effective_factor)),
                factor_source=line.factor_source,
                factor_reference_year=line.factor_reference_year,
                factor_version_id=line.factor_version_id,
                resolution_flags=[str(flag) for flag in line.resolution_flags],
                data_quality_tier=line.data_quality_tier,
            )
            for line in run.line_results
        ],
        totals=TotalsOut(
            scope1=as_text(totals.scope1),
            scope2_location=as_text(totals.scope2_location),
            scope2_market=as_text(totals.scope2_market),
            scope2_headline=as_text(totals.scope2_headline),
            scope3=as_text(totals.scope3),
            scope3_by_category={k: as_text(v) for k, v in totals.scope3_by_category.items()},
            total_scope12=as_text(totals.scope1 + totals.scope2_headline),
            total_all=as_text(totals.scope1 + totals.scope2_headline + totals.scope3),
            memo={k: as_text(v) for k, v in totals.memo.items()},
        ),
        excluded=run.excluded_records,
    )


def supplied_factors(request: InventoryRequest,
                     records: list[ActivityRecord]) -> list[EmissionFactor]:
    """The factors the customer provided, one per row that carries one.

    A supplied factor without a citation is refused rather than quietly
    dropped: silently ignoring it would report the row as zero while the
    customer believed their own number had been used.
    """
    by_id = {record.record_id: record for record in records}
    built = []
    for item in request.records:
        if item.supplied_factor is None:
            continue
        if not item.supplied_factor_source.strip():
            raise ValueError(
                f"Row {item.record_id} supplies its own emission factor but does not say "
                f"where it came from. Cite the contract, certificate or supplier document, "
                f"so the report can show a verifier what the number is.")
        built.append(supplied_factor(
            by_id[item.record_id], item.supplied_factor,
            item.supplied_factor_unit or item.unit or "kWh",
            item.supplied_factor_source.strip(), request.reporting_year))
    return built


#: Which Scope 1 rows are a fuel purchase, and so have a well-to-tank at all.
#: Categories 1.1 and 1.2 are stationary and mobile combustion; 1.3 and 1.4 are
#: process and fugitive, whose upstream sits in Category 1 as a purchased good.
FUEL_CATEGORIES = ("1.1", "1.2")


def _is_fuel(published_name: str, ghg_category: str) -> bool:
    name = published_name.replace("�", "/").replace("—", "/").replace("–", "/")
    if name.startswith(("Fuels /", "Fuels ", "Bioenergy /", "Bioenergy ")):
        return True
    if name.startswith(("Stationary combustion", "Coal", "Other primary solid biomass")):
        return True
    return ghg_category in FUEL_CATEGORIES


#: How a derived Category 3 record is named, so it can never collide with a
#: record the customer sent and the browser can tell what produced it.
WTT_SUFFIX = "::wtt"
TD_SUFFIX = "::td"
WTT_ELEC_SUFFIX = "::wtt-elec"

#: A record whose id already ends in one of these is itself a derived line, or
#: is pretending to be. Deriving from it again would produce two lines with the
#: same id, and the browser keeps one per id - so a row would quietly show
#: somebody else's number.
DERIVED_SUFFIXES = (WTT_SUFFIX, TD_SUFFIX, WTT_ELEC_SUFFIX)


def _already_derived(record_id: str) -> bool:
    return record_id.endswith(DERIVED_SUFFIXES)


def _free_id(wanted: str, taken: set[str]) -> str:
    """`wanted`, or the next spelling of it nobody is using.

    A line's id is how the browser puts a figure back on a row, so two lines
    with one id means a row quietly showing somebody else's number. Record ids
    come from the browser and could be anything, including something that
    looks exactly like a derived one.
    """
    candidate, suffix = wanted, 2
    while candidate in taken:
        candidate = f"{wanted}-{suffix}"
        suffix += 1
    taken.add(candidate)
    return candidate


def derive_category_3(request: InventoryRequest, records: list[ActivityRecord],
                      reporting_year: int = 2025):
    """The Category 3 lines that follow from what has already been recorded.

    Scope 3 Category 3 is fuel- and energy-related activity that is not in
    Scope 1 or Scope 2:

      the upstream emissions of every fuel burned on site - extracting,
      refining and delivering it - which DESNZ publishes for each of its
      fuels, so a plant that has recorded its diesel has already said
      everything needed to work this out;

      the electricity lost between the power station and the meter, which the
      site paid for and never received. The naive consumption x loss rate
      understates it: to deliver C with a loss rate L the grid must generate
      C / (1 - L), so the loss is C x L / (1 - L). India's rate is high, so
      the difference is not academic.

    What CANNOT be derived is reported as well. Nobody publishes an upstream
    factor for Indian grid electricity, and the loss rate belongs to the grid
    or the utility, not to this service. A category that silently covers some
    of its sources is worse than one that says which.
    """
    counterparts = wtt_counterparts()
    supplied: list[EmissionFactor] = []
    taken = {record.record_id for record in records}
    # The published name of each activity, so a derived line can say which fuel
    # it came from. Five lines all reading "the well-to-tank factor for this
    # fuel" tell the reader nothing about which five.
    names = {activity.activity_key: activity.name for activity in activities_for()}
    derived_records: list[ActivityRecord] = []
    derived: list[DerivedOut] = []
    not_derived: list[NotDerivedOut] = []

    loss_rate = request.td_loss_rate
    loss_cited = bool(request.td_loss_rate_source.strip())

    for record in records:
        if _already_derived(record.record_id):
            continue
        if record.scope == "1":
            upstream = counterparts.get(record.activity_key)
            if upstream is None:
                # Only a FUEL has a well-to-tank. A refrigerant leak or a
                # calcination reaction has upstream emissions too, but they
                # belong to Category 1 as a purchased good - saying "no
                # well-to-tank factor covers this fuel" about a cylinder of
                # HFC-134a would be noise about something that was never
                # missing.
                if not _is_fuel(names.get(record.activity_key, ""),
                                record.ghg_category):
                    continue
                fuel = names.get(record.activity_key, record.activity_key)
                not_derived.append(NotDerivedOut(
                    from_record_id=record.record_id, kind="wtt_fuel",
                    reason=f"{fuel}: no published well-to-tank factor covers this fuel, "
                           f"so the upstream emissions of buying it are not included."))
                continue
            line_id = _free_id(f"{record.record_id}{WTT_SUFFIX}", taken)
            derived_records.append(replace(
                record, record_id=line_id,
                activity_key=upstream, scope="3", ghg_category="3.3",
                scope2_view=None))
            fuel = names.get(record.activity_key, "this fuel")
            derived.append(DerivedOut(
                record_id=line_id,
                from_record_id=record.record_id, kind="wtt_fuel",
                basis=f"{fuel}: the published well-to-tank factor, on the "
                      f"{record.value} {record.unit or ''} already recorded in Scope 1."))

        elif record.scope == "2" and record.scope2_view != "market":
            if loss_rate is None or not loss_cited:
                not_derived.append(NotDerivedOut(
                    from_record_id=record.record_id, kind="td_losses",
                    reason="Transmission and distribution losses need the loss rate "
                           "published for your grid or utility, and where it came "
                           "from. Enter both and this line is worked out for you."))
                continue
            # C x L / (1 - L): the generation needed to deliver what was used.
            lost = (record.value or D(0)) * loss_rate / (D(1) - loss_rate)
            line_id = _free_id(f"{record.record_id}{TD_SUFFIX}", taken)
            derived_records.append(replace(
                record, record_id=line_id,
                value=lost, scope="3", ghg_category="3.3", scope2_view=None))
            # The line is calculated from the exact figure; only this sentence
            # is rounded, because nobody reads 117975.9036144578313253012048.
            shown = lost.quantize(D(1))
            percent = (loss_rate * 100).normalize()
            derived.append(DerivedOut(
                record_id=line_id,
                from_record_id=record.record_id, kind="td_losses",
                basis=f"{shown:,} {record.unit or ''} lost in transmission and "
                      f"distribution at a rate of {percent}% of generation, at the same "
                      f"published grid factor. Source: "
                      f"{request.td_loss_rate_source.strip()}"))

    # The upstream of purchased electricity, if the company holds a figure for
    # it. Nobody publishes one for the Indian grid, so this is the only honest
    # way to include it - and with the source, the same rule as everywhere else.
    wtt_factor = request.electricity_wtt_factor
    wtt_cited = bool(request.electricity_wtt_source.strip())
    electricity = [record for record in records
                   if record.scope == "2" and record.scope2_view != "market"
                   and record.unit and record.value
                   and not _already_derived(record.record_id)]

    if electricity and (wtt_factor is None or not wtt_cited):
        not_derived.append(NotDerivedOut(
            from_record_id="", kind="wtt_electricity",
            reason="No published set gives the upstream emissions of Indian grid "
                   "electricity - the fuel burned to generate it, before it reaches "
                   "the grid. Enter the figure your company holds, with its source, "
                   "and this line is worked out for you."))
    elif electricity:
        for record in electricity:
            line_id = _free_id(f"{record.record_id}{WTT_ELEC_SUFFIX}", taken)
            supplied.append(supplied_factor(
                replace(record, record_id=line_id),
                wtt_factor, record.unit or "kWh",
                request.electricity_wtt_source.strip(), reporting_year))
            derived_records.append(replace(
                record, record_id=line_id,
                activity_key=f"{SUPPLIED_PREFIX}{line_id}",
                scope="3", ghg_category="3.3", scope2_view=None))
            derived.append(DerivedOut(
                record_id=line_id,
                from_record_id=record.record_id, kind="wtt_electricity",
                basis=f"The upstream of {record.value} {record.unit} of purchased "
                      f"electricity at {wtt_factor} kgCO2e per {record.unit}. "
                      f"Source: {request.electricity_wtt_source.strip()}"))

    return derived_records, derived, not_derived, supplied


def calculate_inventory(request: InventoryRequest, gwp_source: str) -> InventoryResponse:
    records = to_records(request)
    derived_records, derived, not_derived, derived_supplied = derive_category_3(
        request, records, request.reporting_year)
    run = run_inventory(
        records + derived_records,
        gwp_set_name=request.gwp_set,
        reporting_year=request.reporting_year,
        scope2_view=request.scope2_view,
        supplied=supplied_factors(request, records) + derived_supplied,
    )
    response = to_response(run, request, gwp_source)
    response.derived = derived
    response.not_derived = not_derived
    return response



def list_activities(scope: Optional[str], region: Optional[str], search: Optional[str],
                    limit: int) -> list[ActivityOut]:
    matches = activities_for(scope, region)
    if search:
        needle = search.lower()
        matches = tuple(a for a in matches if needle in a.name.lower()
                        or needle in a.category_path.lower())
    return [
        ActivityOut(
            activity_key=a.activity_key, name=a.name, scope=a.scope,
            category_path=a.category_path, unit=a.unit, units=list(a.units),
            region=a.region, source=a.source, reference_year=a.reference_year,
            gases=list(a.gases),
        )
        for a in matches[:limit]
    ]


def catalogue_mappings() -> list[CatalogueMappingOut]:
    """Which published factor calculates each catalogue source, per unit.

    The browser attaches these as a user picks a source, so a row that CAN be
    calculated is, without anyone having to hunt through the factor library. A
    source absent from this list has no published factor and stays honestly
    uncalculated.
    """
    return [
        CatalogueMappingOut(
            catalogue_key=mapping.catalogue_key,
            catalogue_name=mapping.catalogue_name,
            unit=mapping.unit,
            activity_key=mapping.activity_key,
            engine_name=mapping.engine_name,
            region=mapping.region,
            source=mapping.source,
        )
        for mapping in load_catalogue_map()
    ]


__all__ = ["GWP_SETS", "InventoryRequest", "InventoryResponse", "ActivityOut",
           "CatalogueMappingOut", "calculate_inventory", "catalogue_mappings",
           "list_activities"]
