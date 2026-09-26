"""N2O from managed soils, IPCC 2006 Volume 4 Chapter 11, Tier 1.

This is a METHOD, not a factor lookup. Fertiliser N2O cannot be read off a
table against a tonne of product: it depends on how much nitrogen reached the
soil, and on what happens to the fraction that volatilises or leaches away. The
IPCC equations are implemented here and the default parameters are read from
`data/ipcc/managed_soils.json`, which cites the table each one came from.

Equations implemented:
  11.1   direct N2O from N additions
  11.9   indirect N2O from volatilised N that is re-deposited
  11.10  indirect N2O from N lost to leaching and runoff

Everything is in Decimal, and the result reports each component so an assurance
provider can follow the arithmetic. Nothing is assumed: a caller who does not
know whether leaching occurs on their land must say so, because IPCC's default
for regions without it is zero, not 0.3.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional

from ..quantities import D, ZERO

PARAMETERS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "ipcc" / "managed_soils.json"

# N2O = N2O-N x 44/28 (molecular mass ratio), stated under Equation 11.1.
N_TO_N2O = D(44) / D(28)


@dataclass(frozen=True)
class SoilParameters:
    """IPCC Tier 1 defaults, with the source they were read from."""
    source_name: str
    source_url: str
    read_from: str
    values: Mapping[str, Decimal]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "SoilParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        values = {name: D(str(item["value"]))
                  for group in ("direct", "indirect")
                  for name, item in data[group].items()}
        return cls(data["source_name"], data["source_url"], data["read_from"], values)

    def get(self, name: str) -> Decimal:
        try:
            return self.values[name]
        except KeyError:
            raise KeyError(
                f"No IPCC default named {name!r}. Ingest it from {self.source_name} "
                f"- do not estimate one."
            ) from None


@dataclass(frozen=True)
class NitrogenInputs:
    """Nitrogen reaching the soil in one year, in kilograms of N.

    These are nitrogen masses, not product masses: 100 kg of urea is 46 kg of N.
    Converting product to N is the caller's job, because the nutrient content is
    printed on the bag and varies by product.
    """
    synthetic_fertiliser_n: Decimal = ZERO      # F_SN
    organic_amendment_n: Decimal = ZERO         # F_ON: manure, compost, sludge
    grazing_deposition_n: Decimal = ZERO        # F_PRP: urine and dung on pasture
    crop_residue_n: Decimal = ZERO              # F_CR
    mineralised_n: Decimal = ZERO               # F_SOM
    flooded_rice_n: Decimal = ZERO              # takes EF1FR, not EF1
    grazing_is_cattle_poultry_pigs: bool = True
    leaching_occurs: bool = True


@dataclass(frozen=True)
class SoilN2OResult:
    direct_kg_n2o: Decimal
    volatilisation_kg_n2o: Decimal
    leaching_kg_n2o: Decimal
    components: Mapping[str, Decimal] = field(default_factory=dict)

    @property
    def total_kg_n2o(self) -> Decimal:
        return self.direct_kg_n2o + self.volatilisation_kg_n2o + self.leaching_kg_n2o


def managed_soil_n2o(
    inputs: NitrogenInputs,
    parameters: Optional[SoilParameters] = None,
) -> SoilN2OResult:
    """N2O emitted from one year of nitrogen additions, in kilograms of N2O.

    The result is a mass of N2O, not CO2e: the GWP set chosen for the report is
    applied afterwards, so the same inventory can be expressed under AR5 or AR6.
    """
    p = parameters or SoilParameters.load()

    # --- Equation 11.1: direct -----------------------------------------------
    ef1 = p.get("EF1")
    ef1fr = p.get("EF1FR")
    ef3 = p.get("EF3PRP_CPP" if inputs.grazing_is_cattle_poultry_pigs else "EF3PRP_SO")

    upland_n = (inputs.synthetic_fertiliser_n + inputs.organic_amendment_n
                + inputs.crop_residue_n + inputs.mineralised_n)
    direct_n = upland_n * ef1 + inputs.flooded_rice_n * ef1fr + inputs.grazing_deposition_n * ef3

    # --- Equation 11.9: volatilisation, then re-deposition --------------------
    volatilised_n = (inputs.synthetic_fertiliser_n * p.get("FracGASF")
                     + (inputs.organic_amendment_n + inputs.grazing_deposition_n) * p.get("FracGASM"))
    volatilisation_n = volatilised_n * p.get("EF4")

    # --- Equation 11.10: leaching and runoff ---------------------------------
    # IPCC's default for regions where leaching does not occur is zero, not 0.3.
    frac_leach = p.get("FracLEACH_H") if inputs.leaching_occurs else ZERO
    leached_n = (inputs.synthetic_fertiliser_n + inputs.organic_amendment_n
                 + inputs.grazing_deposition_n + inputs.crop_residue_n
                 + inputs.mineralised_n + inputs.flooded_rice_n) * frac_leach
    leaching_n = leached_n * p.get("EF5")

    return SoilN2OResult(
        direct_kg_n2o=direct_n * N_TO_N2O,
        volatilisation_kg_n2o=volatilisation_n * N_TO_N2O,
        leaching_kg_n2o=leaching_n * N_TO_N2O,
        components={
            "direct_n2o_n": direct_n,
            "volatilised_n": volatilised_n,
            "volatilisation_n2o_n": volatilisation_n,
            "leached_n": leached_n,
            "leaching_n2o_n": leaching_n,
            "ef1_applied": ef1,
            "ef3_applied": ef3,
            "frac_leach_applied": frac_leach,
        },
    )


def nitrogen_in(product_kg: Decimal | str | float, nitrogen_fraction: Decimal | str | float) -> Decimal:
    """Nitrogen in a quantity of fertiliser product.

    Urea is 46% N, DAP 18%, ammonium sulphate 21%. The fraction belongs to the
    product the site actually bought, so it is asked for rather than assumed.
    """
    fraction = D(nitrogen_fraction)
    if not (ZERO < fraction <= D(1)):
        raise ValueError(
            f"Nitrogen fraction must be between 0 and 1 (urea is 0.46), got {fraction}.")
    return D(product_kg) * fraction
