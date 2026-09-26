"""IPCC methods that cannot be expressed as a factor per unit of activity.

A fertiliser's N2O depends on how much nitrogen reached the soil and what
happened to the part that volatilised or leached; a landfill's methane depends
on what was buried years ago; a cement kiln's CO2 comes out of the limestone
whatever heats it. These are equations with parameters, not lookups, so they
live here rather than in the factor registry.

They are grouped by the IPCC volume they come from:

    agriculture   Volume 4 — managed soils, lime and urea, enteric, manure
    waste         Volume 5 — wastewater, solid waste disposal
    industry      Volume 3 — minerals, chemicals, metals

Every one of them returns a mass of gas - CO2, CH4, N2O, SF6, CF4, C2F6 - never
CO2e, so the GWP set the customer reports under is applied afterwards and the
same inventory can be expressed on either basis.
"""
from .agriculture import (CarbonateParameters, CarbonateResult, EntericParameters,
                          EntericResult, Herd, LivestockGroup, ManureCH4Result,
                          ManureN2OResult, ManureParameters, ManureStream,
                          NitrogenInputs, SoilN2OResult, SoilParameters,
                          annual_n_excretion, climate_band, enteric_ch4, liming_co2,
                          managed_soil_n2o, manure_ch4, manure_n2o, nitrogen_in,
                          urea_co2, urea_nitrogen)
from .errors import FactorNotPublished, ReportedElsewhere
from .industry import (CarbonateInput, IndustrialParameters, ProcessResult, SteelStep,
                       adipic_acid_n2o, aluminium_emissions, ammonia_co2,
                       carbide_emissions, carbonate_co2, cement_clinker_co2,
                       ferroalloy_co2, glass_co2, iron_and_steel_emissions, lead_co2,
                       lime_co2, magnesium_sf6, nitric_acid_n2o, titanium_dioxide_co2,
                       zinc_co2)
from .waste import (SolidWasteParameters, SolidWasteResult, TreatmentPathway,
                    WasteStream, WastewaterCH4Result, WastewaterParameters,
                    nitrogen_in_effluent, organic_load_from_population,
                    solid_waste_ch4, streams_from_composition, wastewater_ch4,
                    wastewater_n2o)

__all__ = [
    # --- Volume 4: agriculture ---------------------------------------------
    "NitrogenInputs", "SoilN2OResult", "SoilParameters", "managed_soil_n2o", "nitrogen_in",
    "CarbonateParameters", "CarbonateResult", "liming_co2", "urea_co2", "urea_nitrogen",
    "EntericParameters", "EntericResult", "Herd", "enteric_ch4",
    # --- shared refusals ----------------------------------------------------
    "FactorNotPublished", "ReportedElsewhere",
    "LivestockGroup", "ManureCH4Result", "ManureN2OResult", "ManureParameters",
    "ManureStream", "annual_n_excretion", "climate_band",
    "manure_ch4", "manure_n2o",
    # --- Volume 5: waste ----------------------------------------------------
    "TreatmentPathway", "WastewaterCH4Result", "WastewaterParameters",
    "nitrogen_in_effluent", "organic_load_from_population", "wastewater_ch4",
    "wastewater_n2o",
    "SolidWasteParameters", "SolidWasteResult", "WasteStream", "solid_waste_ch4",
    "streams_from_composition",
    # --- Volume 3: industrial processes -------------------------------------
    "CarbonateInput", "IndustrialParameters", "ProcessResult", "SteelStep",
    "adipic_acid_n2o", "aluminium_emissions", "ammonia_co2", "carbide_emissions",
    "carbonate_co2", "cement_clinker_co2", "ferroalloy_co2", "glass_co2",
    "iron_and_steel_emissions", "lead_co2", "lime_co2", "magnesium_sf6",
    "nitric_acid_n2o", "titanium_dioxide_co2", "zinc_co2",
]
