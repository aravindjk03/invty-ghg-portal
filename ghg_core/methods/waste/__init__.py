"""Waste — IPCC 2006 Volume 5.

A landfill's methane depends on what was buried in earlier years; a treatment
works' on the strength of its effluent. Neither is a factor per unit.
"""
from .solid_waste import (SolidWasteParameters, SolidWasteResult, WasteStream,
                          solid_waste_ch4, streams_from_composition)
from .wastewater import (TreatmentPathway, WastewaterCH4Result, WastewaterParameters,
                         nitrogen_in_effluent, organic_load_from_population,
                         wastewater_ch4, wastewater_n2o)

__all__ = [
    "SolidWasteParameters", "SolidWasteResult", "WasteStream", "solid_waste_ch4",
    "streams_from_composition",
    "TreatmentPathway", "WastewaterCH4Result", "WastewaterParameters",
    "nitrogen_in_effluent", "organic_load_from_population", "wastewater_ch4",
    "wastewater_n2o",
]
