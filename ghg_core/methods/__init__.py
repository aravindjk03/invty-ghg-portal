"""IPCC methods that cannot be expressed as a factor per unit of activity.

A fertiliser's N2O depends on how much nitrogen reached the soil and what
happened to the part that volatilised or leached; a landfill's methane depends
on what was buried years ago; a wastewater plant's depends on the strength of
the effluent and how anaerobic each treatment step is. These are equations with
parameters, not lookups, so they live here rather than in the factor registry.

Every one of them returns a mass of gas - CH4, N2O or CO2 - never CO2e, so the
GWP set the customer reports under is applied afterwards and the same inventory
can be expressed on either basis.
"""
from .enteric import (EntericParameters, EntericResult, FactorNotPublished, Herd,
                      enteric_ch4)
from .lime_urea import (CarbonateParameters, CarbonateResult, liming_co2, urea_co2,
                        urea_nitrogen)
from .managed_soils import (NitrogenInputs, SoilN2OResult, SoilParameters,
                            managed_soil_n2o, nitrogen_in)
from .manure import (LivestockGroup, ManureCH4Result, ManureN2OResult,
                     ManureParameters, ManureStream, NotManureManagement,
                     annual_n_excretion, climate_band, manure_ch4, manure_n2o)
from .solid_waste import (SolidWasteParameters, SolidWasteResult, WasteStream,
                          solid_waste_ch4, streams_from_composition)
from .wastewater import (TreatmentPathway, WastewaterCH4Result, WastewaterParameters,
                         nitrogen_in_effluent, organic_load_from_population,
                         wastewater_ch4, wastewater_n2o)

__all__ = [
    # managed soils (V4 Ch11)
    "NitrogenInputs", "SoilN2OResult", "SoilParameters", "managed_soil_n2o", "nitrogen_in",
    # lime and urea (V4 Ch11)
    "CarbonateParameters", "CarbonateResult", "liming_co2", "urea_co2", "urea_nitrogen",
    # enteric fermentation (V4 Ch10)
    "EntericParameters", "EntericResult", "FactorNotPublished", "Herd", "enteric_ch4",
    # manure management (V4 Ch10)
    "LivestockGroup", "ManureCH4Result", "ManureN2OResult", "ManureParameters",
    "ManureStream", "NotManureManagement", "annual_n_excretion", "climate_band",
    "manure_ch4", "manure_n2o",
    # wastewater (V5 Ch6)
    "TreatmentPathway", "WastewaterCH4Result", "WastewaterParameters",
    "nitrogen_in_effluent", "organic_load_from_population", "wastewater_ch4",
    "wastewater_n2o",
    # solid waste disposal (V5 Ch3)
    "SolidWasteParameters", "SolidWasteResult", "WasteStream", "solid_waste_ch4",
    "streams_from_composition",
]
