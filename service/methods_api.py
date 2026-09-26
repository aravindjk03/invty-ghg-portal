"""HTTP contract for the IPCC methods that are not factors per unit.

Everything in the factor registry is a value per unit of activity: a litre of
diesel, a kilowatt hour, a tonne-kilometre. Six sources in this library are not
like that. A landfill's methane depends on what was buried in previous years; a
fertiliser's N2O depends on what happened to the nitrogen after it reached the
soil; a herd's methane depends on the region and the climate. Those are
equations, and they live in `ghg_core.methods`.

This module exposes them over the same contract as the inventory: the caller
says which GWP set the report is on, and the answer comes back as gas masses
AND as CO2e under that set, with the source of every parameter. Nothing is
calculated in the browser.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from ghg_core.methods import (Herd, LivestockGroup, ManureStream, NitrogenInputs,
                              TreatmentPathway, WasteStream, enteric_ch4, liming_co2,
                              managed_soil_n2o, manure_ch4, manure_n2o,
                              nitrogen_in_effluent, organic_load_from_population,
                              solid_waste_ch4, urea_co2, urea_nitrogen, wastewater_ch4,
                              wastewater_n2o)
from ghg_core.quantities import D, ZERO
from ghg_core.rebasis import rebase

from .inventory import GWP_SETS, load_gwp


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


#: What each method is, what it needs, and the chapter it comes from. Served so
#: the browser can build its forms without hard-coding any of this.
METHOD_CATALOGUE: tuple[dict, ...] = (
    {
        "key": "managed_soils",
        "name": "N2O from managed soils",
        "scope": "1",
        "gases": ["N2O"],
        "source": "IPCC 2006 Volume 4 Chapter 11, Equations 11.1, 11.9 and 11.10",
        "why_not_a_factor": "The N2O depends on how much nitrogen reached the soil and on what "
                            "happened to the part that volatilised or leached away, not on the "
                            "mass of product bought.",
        "needs": ["nitrogen applied, by source, in kilograms of N"],
    },
    {
        "key": "lime_and_urea",
        "name": "CO2 from liming and urea application",
        "scope": "1",
        "gases": ["CO2"],
        "source": "IPCC 2006 Volume 4 Chapter 11, Equations 11.12 and 11.13",
        "why_not_a_factor": "Limestone and dolomite carry different carbon, and urea has to be "
                            "counted here as CO2 and again under managed soils as nitrogen.",
        "needs": ["tonnes of limestone, dolomite and urea applied"],
    },
    {
        "key": "enteric_fermentation",
        "name": "CH4 from enteric fermentation",
        "scope": "1",
        "gases": ["CH4"],
        "source": "IPCC 2006 Volume 4 Chapter 10, Tables 10.10 and 10.11",
        "why_not_a_factor": "The factor per head differs by region because animal size and milk "
                            "yield differ; poultry has no published factor at all.",
        "needs": ["head of each species", "the region the cattle are farmed in"],
    },
    {
        "key": "manure_management",
        "name": "CH4 and N2O from manure management",
        "scope": "1",
        "gases": ["CH4", "N2O"],
        "source": "IPCC 2006 Volume 4 Chapter 10, Tables 10.14 to 10.16, 10.19, 10.21 to 10.23",
        "why_not_a_factor": "The methane depends on the average annual temperature where the "
                            "manure sits, and the nitrous oxide on how it is stored.",
        "needs": ["head of each species", "average annual temperature",
                  "how the manure is stored, and the share on each system"],
    },
    {
        "key": "wastewater",
        "name": "CH4 and N2O from wastewater",
        "scope": "1",
        "gases": ["CH4", "N2O"],
        "source": "IPCC 2006 Volume 5 Chapter 6, Equations 6.2, 6.3, 6.7 and 6.8",
        "why_not_a_factor": "A factor per cubic metre would assume a strength of effluent nobody "
                            "measured. The methane follows the organic load, the nitrous oxide "
                            "the nitrogen discharged.",
        "needs": ["organic load as BOD or COD", "the treatment route",
                  "population and protein intake, for the nitrogen"],
    },
    {
        "key": "solid_waste",
        "name": "CH4 from solid waste disposal",
        "scope": "1",
        "gases": ["CH4"],
        "source": "IPCC 2006 Volume 5 Chapter 3, Equations 3.1 to 3.6 (First Order Decay)",
        "why_not_a_factor": "Waste buried this year emits nothing this year, and waste buried a "
                            "decade ago is still decaying. The model needs the disposal history.",
        "needs": ["tonnes disposed in each year, not just this year",
                  "the kind of site and the climate zone"],
    },
)


# --- requests ---------------------------------------------------------------

class _Base(_Strict):
    gwp_set: Literal["AR5", "AR6"] = "AR5"
    note: str = Field(default="", max_length=400)


class ManagedSoilsRequest(_Base):
    method: Literal["managed_soils"]
    synthetic_fertiliser_n: Decimal = ZERO
    organic_amendment_n: Decimal = ZERO
    grazing_deposition_n: Decimal = ZERO
    crop_residue_n: Decimal = ZERO
    mineralised_n: Decimal = ZERO
    flooded_rice_n: Decimal = ZERO
    grazing_is_cattle_poultry_pigs: bool = True
    leaching_occurs: bool = True


class LimeAndUreaRequest(_Base):
    method: Literal["lime_and_urea"]
    limestone: Decimal = ZERO
    dolomite: Decimal = ZERO
    urea: Decimal = ZERO
    urea_fraction_of_solution: Decimal = Field(default=Decimal(1), gt=0, le=1)
    mass_unit: Literal["tonne", "kg"] = "tonne"


class EntericRequest(_Base):
    method: Literal["enteric_fermentation"]
    dairy_cattle: Decimal = ZERO
    other_cattle: Decimal = ZERO
    other_animals: dict[str, Decimal] = Field(default_factory=dict)
    cattle_region: str = "indian_subcontinent"
    economy: Literal["developed", "developing"] = "developing"


class ManureGroupIn(_Strict):
    species: str = Field(min_length=1, max_length=64)
    head: Decimal = ZERO
    economy: Literal["developed", "developing"] = "developing"


class ManureStreamIn(_Strict):
    category: str = Field(min_length=1, max_length=64)
    head: Decimal = ZERO
    system: str = Field(min_length=1, max_length=64)
    typical_animal_mass_kg: Optional[Decimal] = None
    share: Decimal = Field(default=Decimal(1), gt=0, le=1)
    nitrogen_excreted_kg_per_head: Optional[Decimal] = None
    volatilisation_percent: Optional[Decimal] = None
    leaching_percent: Optional[Decimal] = None
    total_loss_percent: Optional[Decimal] = None


class ManureRequest(_Base):
    method: Literal["manure_management"]
    groups: list[ManureGroupIn] = Field(default_factory=list, max_length=200)
    streams: list[ManureStreamIn] = Field(default_factory=list, max_length=200)
    region: str = Field(min_length=2, max_length=40)
    temperature_c: Decimal
    excretion_region: Optional[str] = None


class PathwayIn(_Strict):
    system: str = Field(min_length=1, max_length=64)
    share_of_load: Decimal = Field(gt=0, le=1)
    methane_recovered_kg: Decimal = ZERO


class WastewaterRequest(_Base):
    method: Literal["wastewater"]
    organic_load: Optional[Decimal] = None
    load_basis: Literal["BOD", "COD"] = "BOD"
    population: Optional[Decimal] = None
    bod_per_person_g_day: Optional[Decimal] = None
    industrial_correction: Decimal = Field(default=Decimal(1), gt=0)
    pathways: list[PathwayIn] = Field(default_factory=list, max_length=40)
    sludge_removed_kg: Decimal = ZERO
    protein_kg_per_person_year: Optional[Decimal] = None
    economy: Literal["developed", "developing"] = "developing"
    industrial_discharges_to_sewer: bool = True
    sludge_nitrogen_kg: Decimal = ZERO
    nitrogen_discharged_kg: Optional[Decimal] = None


class WasteStreamIn(_Strict):
    component: str = Field(min_length=1, max_length=64)
    site_type: str = Field(min_length=1, max_length=64)
    tonnes_by_year: dict[int, Decimal] = Field(max_length=200)
    doc: Optional[Decimal] = None
    doc_f: Optional[Decimal] = None
    k: Optional[Decimal] = None
    half_life_years: Optional[Decimal] = None
    covered_with_oxidising_material: bool = False
    industrial: bool = False


class SolidWasteRequest(_Base):
    method: Literal["solid_waste"]
    streams: list[WasteStreamIn] = Field(default_factory=list, max_length=60)
    inventory_year: int = Field(ge=1950, le=2100)
    climate_zone: str = Field(min_length=3, max_length=40)
    recovered_ch4_kg: Decimal = ZERO


MethodRequest = (ManagedSoilsRequest | LimeAndUreaRequest | EntericRequest
                 | ManureRequest | WastewaterRequest | SolidWasteRequest)


# --- response ---------------------------------------------------------------

class MethodResponse(_Strict):
    method: str
    gwp_set: str
    gwp_source: str
    source: str
    gas_masses_kg: dict[str, str]
    co2e_kg: str
    co2e_by_gas: dict[str, str]
    working: dict[str, str]
    notes: list[str]


def _decimals(mapping) -> dict[str, str]:
    return {name: str(value) for name, value in mapping.items()}


def _respond(method: str, gas_masses: dict[str, Decimal], *, gwp_set_name: str,
             source: str, working: dict, notes: list[str],
             biogenic_methane: bool = False) -> MethodResponse:
    """Apply the customer's GWP set to the gas masses the method produced.

    The methods never return CO2e themselves, which is what lets the same
    calculation be stated under AR5 or AR6 without being run again.

    `biogenic_methane` picks the right of the two methane GWPs. Methane from a
    cow, a landfill or a treatment pond is not fossil: AR5 gives it 28 rather
    than 30 and AR6 gives it 27.0 rather than 29.8, because fossil methane
    oxidises to fossil CO2 and that is counted in its warming. Using the fossil
    figure for a herd overstates it by about seven percent.
    """
    gwp_set = load_gwp(gwp_set_name)
    rebased = rebase(gas_masses, gwp_set, biogenic=biogenic_methane)
    if biogenic_methane and "CH4" in gas_masses:
        notes = [*notes, "The methane is biogenic, so the non-fossil GWP "
                         f"({gwp_set.gwp('CH4_nonfossil')} under {gwp_set.name}) was applied, "
                         f"not the fossil one."]
    return MethodResponse(
        method=method,
        gwp_set=rebased.gwp_set_name,
        gwp_source=f"{gwp_set.source_name} ({gwp_set.source_url})",
        source=source,
        gas_masses_kg=_decimals(gas_masses),
        co2e_kg=str(rebased.value_kgco2e_per_unit),
        co2e_by_gas=_decimals(rebased.contributions),
        working={name: str(value) for name, value in working.items()},
        notes=notes,
    )


# --- the calculations -------------------------------------------------------

def _managed_soils(request: ManagedSoilsRequest) -> MethodResponse:
    result = managed_soil_n2o(NitrogenInputs(
        synthetic_fertiliser_n=D(request.synthetic_fertiliser_n),
        organic_amendment_n=D(request.organic_amendment_n),
        grazing_deposition_n=D(request.grazing_deposition_n),
        crop_residue_n=D(request.crop_residue_n),
        mineralised_n=D(request.mineralised_n),
        flooded_rice_n=D(request.flooded_rice_n),
        grazing_is_cattle_poultry_pigs=request.grazing_is_cattle_poultry_pigs,
        leaching_occurs=request.leaching_occurs,
    ))
    notes = ["Direct, volatilisation and leaching are reported separately so an "
             "assurance provider can follow the arithmetic."]
    if not request.leaching_occurs:
        notes.append("Leaching was reported as not occurring, so IPCC's default for such "
                     "regions - zero, not 0.3 - was applied.")
    return _respond(
        "managed_soils",
        {"N2O": result.total_kg_n2o},
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 4 Chapter 11, Equations 11.1, 11.9 and 11.10",
        working={
            "direct_kg_n2o": result.direct_kg_n2o,
            "volatilisation_kg_n2o": result.volatilisation_kg_n2o,
            "leaching_kg_n2o": result.leaching_kg_n2o,
            **result.components,
        },
        notes=notes,
    )


def _lime_and_urea(request: LimeAndUreaRequest) -> MethodResponse:
    lime = liming_co2(request.limestone, request.dolomite, mass_unit=request.mass_unit)
    urea = urea_co2(request.urea, mass_unit=request.mass_unit,
                    urea_fraction_of_solution=request.urea_fraction_of_solution)

    # The equations are ratios, so the answer is in whatever mass unit went in.
    to_kg = D(1000) if request.mass_unit == "tonne" else D(1)
    total_co2 = (lime.co2 + urea.co2) * to_kg

    notes = []
    if D(request.urea) > ZERO:
        nitrogen = urea_nitrogen(D(request.urea) * D(request.urea_fraction_of_solution)) * to_kg
        notes.append(
            f"The same urea is also {nitrogen} kg of nitrogen. That has to be reported "
            f"through the managed soils method as N2O; reporting only the CO2 understates "
            f"the inventory.")
    return _respond(
        "lime_and_urea",
        {"CO2": total_co2},
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 4 Chapter 11, Equations 11.12 and 11.13",
        working={
            "liming_co2": lime.co2,
            "urea_co2": urea.co2,
            "mass_unit_in": request.mass_unit,
            **lime.components,
            **urea.components,
        },
        notes=notes,
    )


def _enteric(request: EntericRequest) -> MethodResponse:
    result = enteric_ch4(
        Herd(dairy_cattle=D(request.dairy_cattle),
             other_cattle=D(request.other_cattle),
             other_animals={name: D(head) for name, head in request.other_animals.items()}),
        cattle_region=request.cattle_region,
        economy=request.economy,
    )
    return _respond(
        "enteric_fermentation",
        {"CH4": result.ch4_kg},
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 4 Chapter 10, Tables 10.10 and 10.11",
        biogenic_methane=True,
        working={f"{animal}_kg_ch4": value for animal, value in result.by_animal.items()}
                | {f"{animal}_factor": value for animal, value in result.factors_applied.items()},
        notes=[f"Cattle factors are the {request.cattle_region} row of Table 10.11."],
    )


def _manure(request: ManureRequest) -> MethodResponse:
    methane = manure_ch4(
        [LivestockGroup(g.species, D(g.head), g.economy) for g in request.groups],
        region=request.region,
        temperature_c=D(request.temperature_c),
    )

    gas_masses: dict[str, Decimal] = {"CH4": methane.ch4_kg}
    working: dict[str, object] = {
        f"{species}_kg_ch4": value for species, value in methane.by_species.items()}
    working |= {f"{species}_factor": value for species, value in methane.factors_applied.items()}
    notes = [f"Methane factors are the {request.region} block of Table 10.14 at "
             f"{request.temperature_c} C average annual temperature."]

    if request.streams:
        excretion_region = request.excretion_region or request.region
        nitrous = manure_n2o(
            [ManureStream(
                category=s.category, head=D(s.head), system=s.system,
                typical_animal_mass_kg=s.typical_animal_mass_kg,
                share=D(s.share),
                nitrogen_excreted_kg_per_head=s.nitrogen_excreted_kg_per_head,
                volatilisation_percent=s.volatilisation_percent,
                leaching_percent=s.leaching_percent,
                total_loss_percent=s.total_loss_percent,
            ) for s in request.streams],
            region=excretion_region,
        )
        gas_masses["N2O"] = nitrous.total_kg_n2o
        working |= {
            "direct_kg_n2o": nitrous.direct_kg_n2o,
            "volatilisation_kg_n2o": nitrous.volatilisation_kg_n2o,
            "leaching_kg_n2o": nitrous.leaching_kg_n2o,
            "nitrogen_available_for_soils_kg": nitrous.nitrogen_available_for_soils_kg,
            **nitrous.components,
        }
        if excretion_region != request.region:
            notes.append(f"Table 10.19 has no {request.region} column, so the excretion rates "
                         f"used are {excretion_region}.")
        if nitrous.leaching_kg_n2o == ZERO:
            notes.append("Leaching from the manure systems is reported as zero because IPCC "
                         "publishes no default fraction for it; Equation 10.28 needs a "
                         "country-specific figure.")
        notes.append(f"{nitrous.nitrogen_available_for_soils_kg} kg of nitrogen is left for "
                     f"application to land. Put it into the managed soils method as an "
                     f"organic amendment, or that N2O goes unreported.")
    return _respond(
        "manure_management", gas_masses,
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 4 Chapter 10, Tables 10.14 to 10.16, 10.19, 10.21 to 10.23",
        biogenic_methane=True,
        working=working,
        notes=notes,
    )


def _wastewater(request: WastewaterRequest) -> MethodResponse:
    gas_masses: dict[str, Decimal] = {}
    working: dict[str, object] = {}
    notes: list[str] = []

    if request.organic_load is not None:
        load = D(request.organic_load)
    elif request.population is not None and request.bod_per_person_g_day is not None:
        load = organic_load_from_population(D(request.population),
                                            D(request.bod_per_person_g_day),
                                            D(request.industrial_correction))
        working["organic_load_kg_bod"] = load
        notes.append("The organic load was built from the population with Equation 6.3.")
    else:
        load = None

    if load is not None and request.pathways:
        methane = wastewater_ch4(
            load,
            [TreatmentPathway(p.system, D(p.share_of_load), D(p.methane_recovered_kg))
             for p in request.pathways],
            load_basis=request.load_basis,
            sludge_removed_kg=D(request.sludge_removed_kg),
        )
        gas_masses["CH4"] = methane.ch4_kg
        working |= {f"{system}_kg_ch4": value for system, value in methane.by_pathway.items()}
        working["organic_load_after_sludge"] = methane.organic_load_kg_bod
    elif load is not None:
        notes.append("No treatment route was given, so no methane was calculated: the "
                     "organic load alone does not say how anaerobic the treatment is.")

    if request.nitrogen_discharged_kg is not None:
        nitrogen = D(request.nitrogen_discharged_kg)
    elif request.population is not None and request.protein_kg_per_person_year is not None:
        nitrogen = nitrogen_in_effluent(
            D(request.population), D(request.protein_kg_per_person_year),
            economy=request.economy,
            industrial_discharges_to_sewer=request.industrial_discharges_to_sewer,
            sludge_nitrogen_kg=D(request.sludge_nitrogen_kg),
        )
        notes.append("The effluent nitrogen was built from population and protein with "
                     "Equation 6.8.")
    else:
        nitrogen = None

    if nitrogen is not None:
        gas_masses["N2O"] = wastewater_n2o(nitrogen)
        working["nitrogen_discharged_kg"] = nitrogen

    if not gas_masses:
        notes.append("Nothing could be calculated: give either an organic load with a "
                     "treatment route, or the nitrogen discharged.")
    return _respond(
        "wastewater", gas_masses,
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 5 Chapter 6, Equations 6.2, 6.3, 6.7 and 6.8",
        biogenic_methane=True,
        working=working,
        notes=notes,
    )


def _solid_waste(request: SolidWasteRequest) -> MethodResponse:
    result = solid_waste_ch4(
        [WasteStream(
            component=s.component, site_type=s.site_type,
            tonnes_by_year={int(year): D(tonnes) for year, tonnes in s.tonnes_by_year.items()},
            doc=s.doc, doc_f=s.doc_f, k=s.k, half_life_years=s.half_life_years,
            covered_with_oxidising_material=s.covered_with_oxidising_material,
            industrial=s.industrial,
        ) for s in request.streams],
        inventory_year=request.inventory_year,
        climate_zone=request.climate_zone,
        recovered_ch4_kg=D(request.recovered_ch4_kg),
    )

    notes = ["Only waste buried in earlier years contributes: decay begins on 1 January "
             "of the year after deposition."]
    years = {year for stream in request.streams for year in stream.tonnes_by_year}
    if years and max(years) >= request.inventory_year and len(years) == 1:
        notes.append("The history given covers only the inventory year, so the model has "
                     "nothing to decay. A landfill needs its disposal history.")
    return _respond(
        "solid_waste",
        {"CH4": result.ch4_emitted_kg},
        gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 5 Chapter 3, Equations 3.1 to 3.6 (First Order Decay)",
        biogenic_methane=True,
        working={
            "ch4_generated_kg": result.ch4_generated_kg,
            "ch4_recovered_kg": result.ch4_recovered_kg,
            "remaining_carbon_tonnes": result.remaining_carbon_tonnes,
            **{f"{component}_kg_ch4": value for component, value in result.by_component.items()},
        },
        notes=notes,
    )


_CALCULATORS = {
    "managed_soils": _managed_soils,
    "lime_and_urea": _lime_and_urea,
    "enteric_fermentation": _enteric,
    "manure_management": _manure,
    "wastewater": _wastewater,
    "solid_waste": _solid_waste,
}


def calculate_method(request: MethodRequest) -> MethodResponse:
    return _CALCULATORS[request.method](request)


def list_methods() -> list[dict]:
    return [dict(entry) for entry in METHOD_CATALOGUE]


__all__ = ["GWP_SETS", "METHOD_CATALOGUE", "MethodRequest", "MethodResponse",
           "ManagedSoilsRequest", "LimeAndUreaRequest", "EntericRequest", "ManureRequest",
           "WastewaterRequest", "SolidWasteRequest", "calculate_method", "list_methods"]
