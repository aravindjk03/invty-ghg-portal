"""IPCC methods that cannot be expressed as a factor per unit of activity.

A fertiliser's N2O depends on how much nitrogen reached the soil and what
happened to the part that volatilised or leached; a landfill's methane depends
on what was buried years ago. These are equations with parameters, not lookups,
so they live here rather than in the factor registry.
"""
from .managed_soils import (NitrogenInputs, SoilN2OResult, SoilParameters,
                            managed_soil_n2o, nitrogen_in)

__all__ = ["NitrogenInputs", "SoilN2OResult", "SoilParameters",
           "managed_soil_n2o", "nitrogen_in"]
