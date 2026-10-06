"""Express a published factor under whichever GWP set the customer reports on.

Publishers convert CH4 and N2O to CO2e before publishing, using one assessment
report's values. DESNZ 2025 uses AR5 (CH4 = 28, N2O = 265). A report that
declares AR6 while using those numbers is declaring something untrue.

The ingested factor table keeps the MASS of each gas per unit of activity, so
the CO2e can be rebuilt under any set:

    CO2e = mass(CO2) + Σ mass(gas) × GWP(gas, set)

Nothing here estimates a GWP. A gas the chosen set does not carry raises
GwpNotFoundError, naming the source to ingest it from.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Mapping

from .gwp import CH4_FOSSIL, CH4_NONFOSSIL, CO2, GwpSet, N2O
from .quantities import D, ZERO

# The gas label a factor table uses, mapped to the key a GwpSet is keyed by.
# Methane needs to know whether the carbon was fossil: the two differ under AR6
# and, for fossil methane, under AR5 as well.
GAS_TO_GWP_KEY = {
    "CO2": CO2,
    "N2O": N2O,
}


def gwp_key_for_methane(biogenic: bool) -> str:
    return CH4_NONFOSSIL if biogenic else CH4_FOSSIL


@dataclass(frozen=True)
class RebasedFactor:
    """One activity's factor expressed under a named GWP set."""
    value_kgco2e_per_unit: Decimal
    gwp_set_name: str
    contributions: Mapping[str, Decimal]


def rebase(
    gas_masses_kg_per_unit: Mapping[str, Decimal | str | float],
    gwp_set: GwpSet,
    *,
    biogenic: bool = False,
) -> RebasedFactor:
    """Rebuild a CO2e factor from gas masses under `gwp_set`.

    `gas_masses_kg_per_unit` maps a gas label ("CO2", "CH4", "N2O", or any label
    the set carries, such as "SF6") to the kilograms of that gas emitted per one
    unit of activity.
    """
    total = ZERO
    contributions: dict[str, Decimal] = {}

    for gas, mass in gas_masses_kg_per_unit.items():
        if mass in (None, ""):
            continue
        quantity = D(mass)
        if quantity == ZERO:
            continue

        key = gwp_key_for_methane(biogenic) if gas.upper() == "CH4" else GAS_TO_GWP_KEY.get(gas, gas)
        contribution = quantity * gwp_set.gwp(key)
        contributions[gas] = contribution
        total += contribution

    return RebasedFactor(total, gwp_set.name, contributions)


@dataclass(frozen=True)
class BlendGwp:
    """A refrigerant blend's GWP under one set, with the arithmetic shown."""
    blend: str
    gwp_set_name: str
    value: Decimal
    components: Mapping[str, Decimal]


def blend_gwp(blend: str, composition: Mapping[str, Decimal | str | float],
              gwp_set: GwpSet) -> BlendGwp:
    """A blend's GWP is the mass-weighted sum of its components' GWPs.

    IPCC publishes the components, not the mixture, so this is computed rather
    than looked up - and it is computed under whichever set the customer reports
    on. A component the set does not carry raises, naming the source.
    """
    total = ZERO
    contributions: dict[str, Decimal] = {}
    fractions = sum(D(fraction) for fraction in composition.values())
    if abs(fractions - D(1)) > D("0.001"):
        raise ValueError(
            f"Composition of {blend} sums to {fractions}, not 1. A blend's mass "
            f"fractions must be complete before its GWP means anything.")

    for component, fraction in composition.items():
        share = D(fraction)
        contribution = share * gwp_set.gwp(component)
        contributions[component] = contribution
        total += contribution

    return BlendGwp(blend, gwp_set.name, total, contributions)


def difference_percent(under_a: Decimal, under_b: Decimal) -> Decimal:
    """How much moving from set A to set B changes a figure, as a percentage."""
    if under_a == ZERO:
        return ZERO
    return (under_b - under_a) / under_a * D(100)
