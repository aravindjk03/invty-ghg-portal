"""Industrial processes and product use — IPCC 2006 Volume 3.

What a plant emits from its process rather than from burning fuel: calcining
limestone, the reaction inside a nitric acid plant, the anode effects of an
aluminium cell. For a cement works or a steel mill this is usually the larger
half of the inventory.
"""
from .processes import (CarbonateInput, FactorNotPublished, IndustrialParameters,
                        ProcessResult, SteelStep, adipic_acid_n2o, aluminium_emissions,
                        ammonia_co2, carbide_emissions, carbonate_co2,
                        cement_clinker_co2, ferroalloy_co2, glass_co2,
                        iron_and_steel_emissions, lead_co2, lime_co2, magnesium_sf6,
                        nitric_acid_n2o, titanium_dioxide_co2, zinc_co2)

__all__ = [
    "CarbonateInput", "FactorNotPublished", "IndustrialParameters", "ProcessResult",
    "SteelStep", "adipic_acid_n2o", "aluminium_emissions", "ammonia_co2",
    "carbide_emissions", "carbonate_co2", "cement_clinker_co2", "ferroalloy_co2",
    "glass_co2", "iron_and_steel_emissions", "lead_co2", "lime_co2", "magnesium_sf6",
    "nitric_acid_n2o", "titanium_dioxide_co2", "zinc_co2",
]
