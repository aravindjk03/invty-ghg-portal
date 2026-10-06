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

from ghg_core.methods import (CarbonateInput, EntericParameters, Herd,
                              IndustrialParameters, LivestockGroup, ManureParameters,
                              ManureStream, NitrogenInputs, SolidWasteParameters,
                              SteelStep, TreatmentPathway, WasteStream,
                              WastewaterParameters, adipic_acid_n2o,
                              aluminium_emissions, ammonia_co2, carbide_emissions,
                              carbonate_co2, cement_clinker_co2, enteric_ch4,
                              ferroalloy_co2, glass_co2, iron_and_steel_emissions,
                              lead_co2, lime_co2, liming_co2, magnesium_sf6,
                              managed_soil_n2o, manure_ch4, manure_n2o,
                              nitric_acid_n2o, nitrogen_in_effluent,
                              organic_load_from_population, solid_waste_ch4,
                              titanium_dioxide_co2, urea_co2, urea_nitrogen,
                              wastewater_ch4, wastewater_n2o, zinc_co2)
from ghg_core.quantities import D, ZERO
from ghg_core.rebasis import rebase

from .inventory import GWP_SETS, load_gwp


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


#: What each method is, what it needs, and the chapter it comes from. Served so
#: the browser can build its forms without hard-coding any of this.
#:
#: `computes` lists the catalogue sources the method answers. Those sources have
#: no emission factor and never will - the CO2 in clinker comes out of the
#: limestone, and the N2O from a nitric acid plant depends on its abatement -
#: so a scope page showing them as "no published factor" told a user they were
#: stuck when the method was a click away. The list is kept here, beside the
#: method, so there is one place that knows what each one covers.
METHOD_CATALOGUE: tuple[dict, ...] = (
    {
        "key": "managed_soils",
        "computes": ["agri.fertiliser_n2o"],
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
        "computes": ["agri.lime_application", "agri.urea_application"],
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
        "computes": ["agri.enteric_fermentation"],
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
        "computes": ["agri.manure_management"],
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
        "computes": ["fugitive.ch4_wastewater", "fugitive.n2o_wastewater"],
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
        "computes": [],
        "name": "CH4 from solid waste disposal",
        "scope": "1",
        "gases": ["CH4"],
        "source": "IPCC 2006 Volume 5 Chapter 3, Equations 3.1 to 3.6 (First Order Decay)",
        "why_not_a_factor": "Waste buried this year emits nothing this year, and waste buried a "
                            "decade ago is still decaying. The model needs the disposal history.",
        "needs": ["tonnes disposed in each year, not just this year",
                  "the kind of site and the climate zone"],
    },
    {
        "key": "mineral_industry",
        "computes": ["process.cement_clinker", "process.lime_calcination", "process.dolomite_calcination", "process.limestone_flux", "process.soda_ash_use", "process.glass_carbonates", "process.ceramics", "process.pulp_paper_lime_kiln"],
        "name": "CO2 from cement, lime, glass and carbonates",
        "scope": "1",
        "gases": ["CO2"],
        "source": "IPCC 2006 Volume 3 Chapter 2, Equations 2.4 and 2.8 and Tables 2.1, 2.4, 2.6",
        "why_not_a_factor": "The CO2 comes out of the limestone, not out of the fuel that "
                            "heats it. For a cement works this is usually more than half the "
                            "inventory, and no fuel factor covers any of it.",
        "needs": ["tonnes of clinker, lime or glass made",
                  "tonnes of any other carbonate calcined, and how much of it calcined"],
    },
    {
        "key": "chemical_industry",
        "computes": ["process.ammonia_production", "process.nitric_acid", "process.adipic_acid", "process.urea_production", "process.calcium_carbide", "process.silicon_carbide", "process.titanium_dioxide"],
        "name": "CO2 and N2O from ammonia, nitric acid, adipic acid and carbides",
        "scope": "1",
        "gases": ["CO2", "N2O", "CH4"],
        "source": "IPCC 2006 Volume 3 Chapter 3, Tables 3.1, 3.3, 3.4, 3.7, 3.8, 3.9",
        "why_not_a_factor": "A nitric acid plant makes N2O in the reaction itself, and how "
                            "much depends on the plant type and on whether its abatement was "
                            "actually running.",
        "needs": ["tonnes of product", "the process route and any abatement fitted"],
    },
    {
        "key": "metal_industry",
        "computes": ["process.iron_steel_bf", "process.iron_steel_dri", "process.iron_steel_eaf_electrode", "process.ferroalloys", "process.aluminium_anode", "process.aluminium_pfc", "process.lead_production", "process.zinc_production"],
        "name": "CO2, CH4, PFCs and SF6 from iron, steel, ferroalloys, aluminium and more",
        "scope": "1",
        "gases": ["CO2", "CH4", "CF4", "C2F6", "SF6"],
        "source": "IPCC 2006 Volume 3 Chapter 4, Tables 4.1, 4.2, 4.5, 4.10, 4.15, 4.20, "
                  "4.21, 4.24",
        "why_not_a_factor": "The carbon is the reductant, not a fuel, and an aluminium cell "
                            "makes CF4 and C2F6 during an anode effect. The route matters "
                            "more than the tonnage: scrap through an arc furnace is a "
                            "eighteenth of iron through a basic oxygen furnace.",
        "needs": ["tonnes of each product", "the furnace or cell technology"],
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


class CarbonateIn(_Strict):
    carbonate: str = Field(min_length=1, max_length=64)
    tonnes: Decimal = ZERO
    fraction_calcined: Decimal = Field(default=Decimal(1), gt=0, le=1)


class MineralIndustryRequest(_Base):
    method: Literal["mineral_industry"]
    clinker_tonnes: Decimal = ZERO
    kiln_dust_recycled: bool = False
    clinker_cao_content: Optional[str] = None
    lime_tonnes: Decimal = ZERO
    lime_type: str = "default_mix"
    glass_tonnes: Decimal = ZERO
    glass_type: Optional[str] = None
    cullet_ratio: Optional[Decimal] = Field(default=None, ge=0, lt=1)
    carbonates: list[CarbonateIn] = Field(default_factory=list, max_length=40)


class ChemicalIndustryRequest(_Base):
    method: Literal["chemical_industry"]
    ammonia_tonnes: Decimal = ZERO
    ammonia_process: str = "average_natural_gas"
    ammonia_co2_recovered_tonnes: Decimal = ZERO
    nitric_acid_tonnes: Decimal = ZERO
    nitric_acid_plant_type: Optional[str] = None
    adipic_acid_tonnes: Decimal = ZERO
    adipic_acid_abatement: Optional[str] = None
    carbide_tonnes: Decimal = ZERO
    carbide_type: str = "calcium_carbide"
    carbide_basis: Literal["product", "petroleum_coke", "carbide_used"] = "product"
    titanium_dioxide_tonnes: Decimal = ZERO
    titanium_dioxide_product: str = "rutile_tio2_chloride_route"


class SteelStepIn(_Strict):
    step: str = Field(min_length=1, max_length=64)
    tonnes: Decimal = ZERO


class MetalIndustryRequest(_Base):
    method: Literal["metal_industry"]
    steel_steps: list[SteelStepIn] = Field(default_factory=list, max_length=20)
    ferroalloy_tonnes: Decimal = ZERO
    ferroalloy_type: Optional[str] = None
    aluminium_tonnes: Decimal = ZERO
    aluminium_cell_technology: Optional[str] = None
    magnesium_tonnes: Decimal = ZERO
    magnesium_sf6_consumed_kg: Optional[Decimal] = None
    lead_tonnes: Decimal = ZERO
    lead_route: str = "default_mix"
    zinc_tonnes: Decimal = ZERO
    zinc_process: str = "default_mix"


MethodRequest = (ManagedSoilsRequest | LimeAndUreaRequest | EntericRequest
                 | ManureRequest | WastewaterRequest | SolidWasteRequest
                 | MineralIndustryRequest | ChemicalIndustryRequest
                 | MetalIndustryRequest)


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


def _accumulate(results, gases: dict, working: dict, notes: list) -> None:
    """Fold one process line into the answer, keeping its working and its notes."""
    for result in results:
        for gas, mass in result.gas_masses_kg.items():
            if mass == ZERO:
                continue
            gases[gas] = gases.get(gas, ZERO) + mass
        working[f"{result.process}_basis"] = result.basis
        for name, value in result.components.items():
            working[f"{result.process}_{name}"] = value
        notes.extend(result.notes)


def _mineral_industry(request: MineralIndustryRequest) -> MethodResponse:
    lines = []
    if D(request.clinker_tonnes) > ZERO:
        lines.append(cement_clinker_co2(
            D(request.clinker_tonnes),
            kiln_dust_recycled=request.kiln_dust_recycled,
            cao_content=request.clinker_cao_content))
    if D(request.lime_tonnes) > ZERO:
        lines.append(lime_co2(D(request.lime_tonnes), lime_type=request.lime_type))
    if D(request.glass_tonnes) > ZERO:
        lines.append(glass_co2(D(request.glass_tonnes), glass_type=request.glass_type,
                               cullet_ratio=request.cullet_ratio))
    carbonates = [CarbonateInput(item.carbonate, D(item.tonnes), D(item.fraction_calcined))
                  for item in request.carbonates if D(item.tonnes) > ZERO]
    if carbonates:
        lines.append(carbonate_co2(carbonates))

    gases: dict[str, Decimal] = {}
    working: dict[str, object] = {}
    notes: list[str] = []
    _accumulate(lines, gases, working, notes)
    if not gases:
        notes.append("Nothing was recorded, so nothing was calculated.")
    return _respond(
        "mineral_industry", gases, gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 3 Chapter 2, Equations 2.4 and 2.8 and Tables 2.1, 2.4, 2.6",
        working=working, notes=notes)


def _chemical_industry(request: ChemicalIndustryRequest) -> MethodResponse:
    lines = []
    if D(request.ammonia_tonnes) > ZERO:
        lines.append(ammonia_co2(
            D(request.ammonia_tonnes), process=request.ammonia_process,
            co2_recovered_tonnes=D(request.ammonia_co2_recovered_tonnes)))
    if D(request.nitric_acid_tonnes) > ZERO:
        if not request.nitric_acid_plant_type:
            raise ValueError(
                "Nitric acid needs the plant type: the published N2O factor runs from 2 to "
                "9 kg per tonne depending on it, so the tonnage alone says nothing.")
        lines.append(nitric_acid_n2o(D(request.nitric_acid_tonnes),
                                     plant_type=request.nitric_acid_plant_type))
    if D(request.adipic_acid_tonnes) > ZERO:
        lines.append(adipic_acid_n2o(D(request.adipic_acid_tonnes),
                                     abatement=request.adipic_acid_abatement))
    if D(request.carbide_tonnes) > ZERO:
        lines.append(carbide_emissions(D(request.carbide_tonnes),
                                       carbide=request.carbide_type,
                                       basis=request.carbide_basis))
    if D(request.titanium_dioxide_tonnes) > ZERO:
        lines.append(titanium_dioxide_co2(D(request.titanium_dioxide_tonnes),
                                          product=request.titanium_dioxide_product))

    gases: dict[str, Decimal] = {}
    working: dict[str, object] = {}
    notes: list[str] = []
    _accumulate(lines, gases, working, notes)
    if not gases:
        notes.append("Nothing was recorded, so nothing was calculated.")
    return _respond(
        "chemical_industry", gases, gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 3 Chapter 3, Tables 3.1, 3.3, 3.4, 3.7, 3.8, 3.9",
        working=working, notes=notes)


def _metal_industry(request: MetalIndustryRequest) -> MethodResponse:
    lines = []
    steps = [SteelStep(item.step, D(item.tonnes)) for item in request.steel_steps
             if D(item.tonnes) > ZERO]
    if steps:
        lines.append(iron_and_steel_emissions(steps))
    if D(request.ferroalloy_tonnes) > ZERO:
        if not request.ferroalloy_type:
            raise ValueError(
                "Ferroalloys need the alloy: the factor runs from 1.3 to 5.0 tonnes of CO2 "
                "per tonne depending on which one.")
        lines.append(ferroalloy_co2(D(request.ferroalloy_tonnes),
                                    alloy=request.ferroalloy_type))
    if D(request.aluminium_tonnes) > ZERO:
        if not request.aluminium_cell_technology:
            raise ValueError(
                "Aluminium needs the cell technology (cwpb, swpb, vss or hss): it sets both "
                "the anode CO2 and the perfluorocarbons.")
        lines.append(aluminium_emissions(
            D(request.aluminium_tonnes),
            cell_technology=request.aluminium_cell_technology))
    if D(request.magnesium_tonnes) > ZERO or request.magnesium_sf6_consumed_kg is not None:
        lines.append(magnesium_sf6(D(request.magnesium_tonnes),
                                   sf6_consumed_kg=request.magnesium_sf6_consumed_kg))
    if D(request.lead_tonnes) > ZERO:
        lines.append(lead_co2(D(request.lead_tonnes), route=request.lead_route))
    if D(request.zinc_tonnes) > ZERO:
        lines.append(zinc_co2(D(request.zinc_tonnes), process=request.zinc_process))

    gases: dict[str, Decimal] = {}
    working: dict[str, object] = {}
    notes: list[str] = []
    _accumulate(lines, gases, working, notes)
    if not gases:
        notes.append("Nothing was recorded, so nothing was calculated.")
    return _respond(
        "metal_industry", gases, gwp_set_name=request.gwp_set,
        source="IPCC 2006 Volume 3 Chapter 4, Tables 4.1, 4.2, 4.5, 4.10, 4.15, 4.20, "
               "4.21, 4.24",
        working=working, notes=notes)


_CALCULATORS = {
    "managed_soils": _managed_soils,
    "lime_and_urea": _lime_and_urea,
    "enteric_fermentation": _enteric,
    "manure_management": _manure,
    "wastewater": _wastewater,
    "solid_waste": _solid_waste,
    "mineral_industry": _mineral_industry,
    "chemical_industry": _chemical_industry,
    "metal_industry": _metal_industry,
}


def calculate_method(request: MethodRequest) -> MethodResponse:
    return _CALCULATORS[request.method](request)


def _labelled(keys) -> list[dict]:
    """A machine key with a readable label, so no screen invents its own wording."""
    return [{"value": key,
             # BOD and COD are already how they are written; the rest are slugs.
             "label": key if key.isupper() else key.replace("_", " ").strip().capitalize()}
            for key in keys]


def _method_options() -> dict[str, dict]:
    """The choices each method actually accepts, read from the parameter files.

    Served so a screen never hard-codes a species, a region, a treatment system
    or a site type. If a table gains a row, the form gains it too; if a screen
    offers something IPCC does not publish, the method would refuse it anyway.
    """
    enteric = EntericParameters.load()
    manure = ManureParameters.load()
    water = WastewaterParameters.load()
    waste = SolidWasteParameters.load()
    industry = IndustrialParameters.load()

    manure_species = sorted({
        species
        for block in manure.methane["cattle_swine_buffalo"].values()
        for species in block["species"]
    } | set(manure.methane["other_livestock"])
      | set(manure.methane["poultry_developed"])
      | set(manure.methane["fixed_factors"]))

    return {
        "enteric_fermentation": {
            "cattle_region": _labelled(sorted(enteric.cattle_by_region)),
            "other_animals": _labelled(sorted(enteric.other_livestock)),
            "not_published": dict(enteric.not_published),
        },
        "manure_management": {
            "region": _labelled(sorted(manure.methane["cattle_swine_buffalo"])),
            "species": _labelled(manure_species),
            "excretion_region": _labelled(manure.nitrous_oxide["excretion_rate"]["regions"]),
            "category": _labelled(sorted(manure.nitrous_oxide["excretion_rate"]["values"])),
            "system": _labelled(sorted(manure.nitrous_oxide["ef3"]["values"])),
            "reported_elsewhere": dict(manure.nitrous_oxide["ef3"]["reported_elsewhere"]),
        },
        "wastewater": {
            "system": _labelled(sorted(water.mcf)),
            "load_basis": _labelled(["BOD", "COD"]),
        },
        "solid_waste": {
            "site_type": _labelled(waste.values["mcf"]["values"]),
            "component": _labelled(waste.values["k"]["group_for_component"]),
            "industrial_component": _labelled(waste.values["doc"]["industrial_waste"]),
            "climate_zone": _labelled(waste.values["k"]["climate_zones"]),
            "climate_zone_help": dict(waste.values["k"]["climate_zones"]),
            "composition_region": _labelled(sorted(waste.values["msw_composition"]["regions"])),
            "no_decay_rate": dict(waste.values["k"]["group_not_published"]),
        },
        "managed_soils": {
            "nitrogen_content_examples": {
                "urea": "0.46", "DAP": "0.18", "ammonium sulphate": "0.21",
            },
        },
        "lime_and_urea": {"mass_unit": _labelled(["tonne", "kg"])},
        "mineral_industry": {
            "lime_type": _labelled(["default_mix", *sorted(industry.group("lime")["values"])]),
            "glass_type": _labelled(sorted(industry.group("glass")["values"])),
            "carbonate": _labelled(sorted(industry.group("carbonates")["values"])),
            "clinker_cao_content": _labelled(
                sorted(industry.group("cement")["cao_variants"]["values"])),
        },
        "chemical_industry": {
            "ammonia_process": _labelled(sorted(industry.group("ammonia")["values"])),
            "nitric_acid_plant_type": _labelled(
                sorted(industry.group("nitric_acid")["values"])),
            "adipic_acid_abatement": _labelled(
                sorted(industry.group("adipic_acid")["destruction_factor"]["values"])),
            "carbide_type": _labelled(["calcium_carbide", "silicon_carbide"]),
            "carbide_basis": _labelled(["product", "petroleum_coke", "carbide_used"]),
            "titanium_dioxide_product": _labelled(
                sorted(industry.group("titanium_dioxide")["values"])),
            "not_published": dict(industry.group("titanium_dioxide")["not_published"]),
        },
        "metal_industry": {
            "steel_step": _labelled(sorted(industry.group("iron_and_steel")["values"])),
            "ferroalloy_type": _labelled(sorted(industry.group("ferroalloys")["values"])),
            "aluminium_cell_technology": _labelled(
                sorted(industry.group("aluminium")["pfc"]["values"])),
            "lead_route": _labelled(sorted(industry.group("lead")["values"])),
            "zinc_process": _labelled(sorted(industry.group("zinc")["values"])),
            "not_published": dict(industry.group("zinc")["not_published"]),
        },
    }


def list_methods() -> list[dict]:
    """Every method, with the choices its form needs."""
    options = _method_options()
    return [{**entry, "options": options.get(entry["key"], {})} for entry in METHOD_CATALOGUE]


__all__ = ["GWP_SETS", "METHOD_CATALOGUE", "MethodRequest", "MethodResponse",
           "ManagedSoilsRequest", "LimeAndUreaRequest", "EntericRequest", "ManureRequest",
           "WastewaterRequest", "SolidWasteRequest", "MineralIndustryRequest",
           "ChemicalIndustryRequest", "MetalIndustryRequest",
           "calculate_method", "list_methods"]
