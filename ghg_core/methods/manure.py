"""Manure management CH4 and N2O, IPCC 2006 Volume 4 Chapter 10, Tier 1.

Manure emits in two ways once it is collected, and the two have nothing to do
with each other:

  CH4   from the organic matter decomposing without air. The Tier 1 factor is
        per head per year and depends on the REGION and the average annual
        TEMPERATURE, because a lagoon in a warm climate and a dung heap in a
        cool one are not the same source. Equation 10.22, Tables 10.14 to 10.16.

  N2O   from the nitrogen the animals excrete, which depends on how the manure
        is stored, not on the animal. Equations 10.25 to 10.30, Tables 10.19,
        10.21 and 10.22.

Manure left where it falls is NOT manure management. IPCC reports pasture,
range and paddock deposition under N2O from managed soils, so a stream on one
of those systems is refused here and pointed at `managed_soils`, which is the
only way to keep a herd from being counted twice.

Everything returns masses of CH4 and N2O so the report can apply whichever GWP
set the customer reports under. Defaults come from
`data/ipcc/manure_management.json`, which cites the table each one came from.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional, Sequence

from ..quantities import D, ZERO

PARAMETERS_PATH = (Path(__file__).resolve().parent.parent.parent
                   / "data" / "ipcc" / "manure_management.json")

# Stated under Equations 10.25, 10.27 and 10.29.
N_TO_N2O = D(44) / D(28)

#: Systems IPCC reports somewhere other than manure management.
REPORTED_ELSEWHERE = {
    "pasture_range_paddock": (
        "Manure dropped on pasture, range or paddock is reported under N2O from "
        "managed soils (Chapter 11, Section 11.2), not manure management. Put the "
        "nitrogen into managed_soils.NitrogenInputs(grazing_deposition_n=...) "
        "instead - counting it here as well would double it."),
    "burned_for_fuel": (
        "Dung burned as fuel is reported under Fuel Combustion, or under Waste "
        "Incineration when it is burned without energy recovery. Only the urine "
        "left on pasture goes to managed soils."),
}

#: Table 10.22 groups its volatilisation fractions more coarsely than Table
#: 10.19 names its animals, so a category maps onto one of its five rows.
_VOLATILISATION_GROUP = {
    "dairy_cattle": "dairy_cow",
    "other_cattle": "other_cattle",
    "buffalo": "other_cattle",
    "swine": "swine",
    "swine_market": "swine",
    "swine_breeding": "swine",
}

#: Table 10.21 names systems more finely than Table 10.22 does.
_VOLATILISATION_SYSTEM = {
    "liquid_slurry_with_crust": "liquid_slurry",
    "liquid_slurry_without_crust": "liquid_slurry",
    "uncovered_anaerobic_lagoon": "anaerobic_lagoon",
    "pit_storage_below_animal_confinements": "pit_storage",
    "deep_bedding_no_mixing": "deep_bedding",
    "deep_bedding_active_mixing": "deep_bedding",
    "poultry_manure_with_litter": "poultry_with_litter",
    "poultry_manure_without_litter": "poultry_without_litter",
}


class NotManureManagement(KeyError):
    """The system belongs to another inventory category, not to this one."""


def climate_band(temperature_c: Decimal | str | float) -> str:
    """Table 10.15's three bands: cool below 15 C, temperate 15-25, warm above 25."""
    temperature = D(temperature_c)
    if temperature < D(15):
        return "cool"
    if temperature <= D(25):
        return "temperate"
    return "warm"


@dataclass(frozen=True)
class ManureParameters:
    source_name: str
    source_url: str
    read_from: str
    methane: Mapping[str, object]
    nitrous_oxide: Mapping[str, object]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "ManureParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["source_name"], data["source_url"], data["read_from"],
                   data["methane"], data["nitrous_oxide"])

    # --- methane ----------------------------------------------------------
    def _temperature_index(self, temperature_c: Decimal | str | float) -> int:
        temperatures = self.methane["temperatures_c"]
        temperature = D(temperature_c)
        if temperature <= D(temperatures[0]):
            return 0                      # the table's "<= 10" column
        if temperature >= D(temperatures[-1]):
            return len(temperatures) - 1   # the table's ">= 28" column
        # Whole degrees in between; a fractional temperature takes its degree.
        return int(temperature) - int(temperatures[0])

    def ch4_factor(
        self,
        species: str,
        *,
        region: Optional[str] = None,
        temperature_c: Decimal | str | float,
        economy: str = "developing",
    ) -> tuple[Decimal, str]:
        """The Tier 1 CH4 factor for one animal, and the table it came from.

        Tables 10.14, 10.15 and 10.16 are tried in that order. A species that
        appears in none of them raises rather than returning zero.
        """
        regional = self.methane["cattle_swine_buffalo"]

        if region is not None and region in regional:
            species_rows = regional[region]["species"]
            if species in species_rows:
                index = self._temperature_index(temperature_c)
                return D(str(species_rows[species][index])), "Table 10.14"
            # Fall through: sheep and goats are never in Table 10.14.
        elif region is not None:
            raise KeyError(
                f"No Table 10.14 region named {region!r}. Regions: "
                f"{', '.join(sorted(regional))}.")

        band = climate_band(temperature_c)

        other = self.methane["other_livestock"]
        if species in other:
            by_economy = other[species]
            if economy not in by_economy:
                raise KeyError(
                    f"Table 10.15 publishes no {economy!r} factor for {species!r}. "
                    f"Published: {', '.join(sorted(by_economy))}.")
            return D(str(by_economy[economy][band])), "Table 10.15"

        developed_poultry = self.methane["poultry_developed"]
        if species in developed_poultry:
            return D(str(developed_poultry[species][band])), "Table 10.15 (poultry)"

        fixed = self.methane["fixed_factors"]
        if species in fixed:
            return D(str(fixed[species]["value"])), "Table 10.16"

        known = sorted({*other, *developed_poultry, *fixed,
                        *(name for block in regional.values() for name in block["species"])})
        raise KeyError(
            f"No IPCC Tier 1 manure methane factor for {species!r}"
            + (f" in region {region!r}" if region else "")
            + f". Published species: {', '.join(known)}.")

    # --- nitrogen ---------------------------------------------------------
    def excretion_rate(self, category: str, region: str) -> Decimal:
        rates = self.nitrous_oxide["excretion_rate"]["values"]
        try:
            by_region = rates[category]
        except KeyError:
            raise KeyError(
                f"No Table 10.19 nitrogen excretion rate for {category!r}. Categories: "
                f"{', '.join(sorted(rates))}."
            ) from None
        try:
            return D(str(by_region[region]))
        except KeyError:
            raise KeyError(
                f"Table 10.19 has no {region!r} column - it publishes "
                f"{', '.join(self.nitrous_oxide['excretion_rate']['regions'])}. "
                f"Note it has no Indian Subcontinent column even though Table 10.14 does; "
                f"the nearest published region is Asia, and the report has to say so."
            ) from None

    def excretion_per_head(self, animal: str) -> Decimal:
        values = self.nitrous_oxide["excretion_per_head"]["values"]
        try:
            return D(str(values[animal]))
        except KeyError:
            raise KeyError(
                f"{animal!r} is not one of the animals Table 10.19 publishes per head "
                f"({', '.join(sorted(values))}); the rest go through Equation 10.30."
            ) from None

    def ef3(self, system: str) -> Decimal:
        if system in REPORTED_ELSEWHERE:
            raise NotManureManagement(REPORTED_ELSEWHERE[system])
        values = self.nitrous_oxide["ef3"]["values"]
        try:
            return D(str(values[system]))
        except KeyError:
            raise KeyError(
                f"No Table 10.21 direct N2O factor for manure system {system!r}. "
                f"Systems: {', '.join(sorted(values))}."
            ) from None

    def _grouped(self, table_name: str, table_label: str, category: str, system: str) -> Decimal:
        group = _VOLATILISATION_GROUP.get(category,
                                          "poultry" if category.startswith("poultry") else "other")
        key = _VOLATILISATION_SYSTEM.get(system, system)
        table = self.nitrous_oxide[table_name]["values"]
        try:
            return D(str(table[group][key])) / D(100)
        except KeyError:
            raise KeyError(
                f"{table_label} publishes no fraction for {category!r} ({group!r}) on "
                f"{system!r} ({key!r}). Published for that group: "
                f"{', '.join(sorted(table.get(group, {})))}. Supply the fraction on the "
                f"stream if the site has measured one - leaving it out would treat the "
                f"loss as zero."
            ) from None

    def frac_gas_ms(self, category: str, system: str) -> Decimal:
        """Table 10.22: the NH3 and NOx part, as a fraction not a percentage."""
        return self._grouped("frac_gas_ms", "Table 10.22", category, system)

    def frac_loss_ms(self, category: str, system: str) -> Decimal:
        """Table 10.23: the TOTAL nitrogen loss, as a fraction not a percentage.

        Larger than `frac_gas_ms`, because it also counts N2O, N2 and the
        leaching and runoff from solid storage and dry lots. This is what
        Equation 10.34 subtracts to find the nitrogen still available for soils.
        """
        return self._grouped("frac_loss_ms", "Table 10.23", category, system)

    @property
    def ef4(self) -> Decimal:
        return D(str(self.nitrous_oxide["ef4"]["value"]))

    @property
    def ef5(self) -> Decimal:
        return D(str(self.nitrous_oxide["ef5"]["value"]))


# --- methane ---------------------------------------------------------------

@dataclass(frozen=True)
class LivestockGroup:
    """Head of one species present over the year."""
    species: str
    head: Decimal | int
    economy: str = "developing"     # only used by Tables 10.15 and 10.16 species


@dataclass(frozen=True)
class ManureCH4Result:
    ch4_kg: Decimal
    by_species: Mapping[str, Decimal] = field(default_factory=dict)
    factors_applied: Mapping[str, Decimal] = field(default_factory=dict)
    tables_used: Mapping[str, str] = field(default_factory=dict)


def manure_ch4(
    groups: Sequence[LivestockGroup],
    *,
    region: Optional[str] = None,
    temperature_c: Decimal | str | float,
    parameters: Optional[ManureParameters] = None,
) -> ManureCH4Result:
    """Annual methane from managed manure, in kilograms of CH4.

    `temperature_c` is the average ANNUAL temperature where the manure sits.
    A summer figure would put a temperate site in the warm column and overstate
    it, so the parameter is named for what it needs.
    """
    p = parameters or ManureParameters.load()
    by_species: dict[str, Decimal] = {}
    factors: dict[str, Decimal] = {}
    tables: dict[str, str] = {}
    total = ZERO

    for group in groups:
        head = D(group.head)
        if head == ZERO:
            continue
        factor, table = p.ch4_factor(group.species, region=region,
                                     temperature_c=temperature_c, economy=group.economy)
        emitted = head * factor
        by_species[group.species] = by_species.get(group.species, ZERO) + emitted
        factors[group.species] = factor
        tables[group.species] = table
        total += emitted

    return ManureCH4Result(ch4_kg=total, by_species=by_species,
                           factors_applied=factors, tables_used=tables)


# --- nitrous oxide ---------------------------------------------------------

def annual_n_excretion(
    excretion_rate: Decimal | str | float,
    typical_animal_mass_kg: Decimal | str | float,
) -> Decimal:
    """Equation 10.30: kg N per head per year from the Table 10.19 rate.

    Nex = N_rate x TAM/1000 x 365. The typical animal mass is the site's own:
    a 250 kg Indian dairy cow and a 600 kg Holstein excrete very differently,
    which is the whole reason the rate is published per 1000 kg.
    """
    mass = D(typical_animal_mass_kg)
    if mass <= ZERO:
        raise ValueError(
            f"Typical animal mass must be positive, got {mass}. It is the live weight "
            f"of one animal in kilograms, not the herd's.")
    return D(excretion_rate) * mass / D(1000) * D(365)


@dataclass(frozen=True)
class ManureStream:
    """One livestock category's nitrogen going into one management system.

    `share` is MS(T,S), the fraction of that category's excretion handled this
    way. The shares for a category may add to less than one - the rest is
    usually dropped on pasture - but never to more.
    """
    category: str                       # a Table 10.19 row, e.g. "dairy_cattle"
    head: Decimal | int
    system: str                         # a Table 10.21 system
    typical_animal_mass_kg: Decimal | str | float | None = None
    share: Decimal | str | float = 1
    nitrogen_excreted_kg_per_head: Decimal | str | float | None = None
    volatilisation_percent: Decimal | str | float | None = None
    leaching_percent: Decimal | str | float | None = None
    total_loss_percent: Decimal | str | float | None = None


@dataclass(frozen=True)
class ManureN2OResult:
    direct_kg_n2o: Decimal
    volatilisation_kg_n2o: Decimal
    leaching_kg_n2o: Decimal
    nitrogen_available_for_soils_kg: Decimal
    components: Mapping[str, Decimal] = field(default_factory=dict)

    @property
    def total_kg_n2o(self) -> Decimal:
        return self.direct_kg_n2o + self.volatilisation_kg_n2o + self.leaching_kg_n2o


def manure_n2o(
    streams: Sequence[ManureStream],
    *,
    region: str,
    parameters: Optional[ManureParameters] = None,
) -> ManureN2OResult:
    """N2O from managed manure, in kilograms of N2O.

    Implements Equation 10.25 (direct), 10.26 with 10.27 (volatilisation) and,
    where the caller has a country-specific fraction, 10.28 with 10.29
    (leaching). It also returns the nitrogen left over for application to soils
    (Equation 10.34 without bedding, taking Table 10.23's total loss), because
    that figure is the input to the managed-soils calculation and forgetting it
    is how manure gets counted once instead of twice.

    Leaching has no IPCC default: Section 10.5.1 says Equation 10.28 should
    only be used where country-specific information exists. With no
    `leaching_percent` on a stream, its leaching is reported as zero and the
    report should say the source is not estimated.
    """
    p = parameters or ManureParameters.load()

    shares: dict[str, Decimal] = {}
    for stream in streams:
        shares[stream.category] = shares.get(stream.category, ZERO) + D(stream.share)
    for category, total_share in shares.items():
        if total_share > D("1.001"):
            raise ValueError(
                f"The shares for {category!r} add to {total_share}, which is more than "
                f"all of its manure. MS(T,S) is a fraction of one category's excretion, "
                f"not a fraction of the herd.")

    direct_n = volatilised_n = leached_n = available_n = ZERO

    for stream in streams:
        head = D(stream.head)
        share = D(stream.share)
        if head == ZERO or share == ZERO:
            continue

        if stream.nitrogen_excreted_kg_per_head is not None:
            nex = D(stream.nitrogen_excreted_kg_per_head)
        elif stream.typical_animal_mass_kg is not None:
            nex = annual_n_excretion(p.excretion_rate(stream.category, region),
                                     stream.typical_animal_mass_kg)
        else:
            raise ValueError(
                f"Stream for {stream.category!r} needs either a typical animal mass "
                f"(so Equation 10.30 can be applied to the Table 10.19 rate) or a "
                f"measured nitrogen_excreted_kg_per_head. Neither can be guessed.")

        managed_n = head * nex * share

        direct_n += managed_n * p.ef3(stream.system)

        if stream.volatilisation_percent is not None:
            frac_gas = D(stream.volatilisation_percent) / D(100)
        else:
            frac_gas = p.frac_gas_ms(stream.category, stream.system)
        volatilised_n += managed_n * frac_gas

        frac_leach = (D(stream.leaching_percent) / D(100)
                      if stream.leaching_percent is not None else ZERO)
        leached_n += managed_n * frac_leach

        # Equation 10.34, without bedding: what is left to spread on land. The
        # fraction subtracted is Table 10.23's TOTAL loss, not Table 10.22's
        # ammonia alone, because nitrogen also leaves as N2O, N2 and runoff.
        frac_loss = (D(stream.total_loss_percent) / D(100)
                     if stream.total_loss_percent is not None
                     else p.frac_loss_ms(stream.category, stream.system))
        available_n += managed_n * (D(1) - frac_loss)

    volatilisation_n = volatilised_n * p.ef4
    leaching_n = leached_n * p.ef5

    return ManureN2OResult(
        direct_kg_n2o=direct_n * N_TO_N2O,
        volatilisation_kg_n2o=volatilisation_n * N_TO_N2O,
        leaching_kg_n2o=leaching_n * N_TO_N2O,
        nitrogen_available_for_soils_kg=available_n,
        components={
            "direct_n2o_n": direct_n,
            "volatilised_n": volatilised_n,
            "volatilisation_n2o_n": volatilisation_n,
            "leached_n": leached_n,
            "leaching_n2o_n": leaching_n,
        },
    )
