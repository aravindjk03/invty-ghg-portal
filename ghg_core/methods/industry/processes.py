"""Industrial process emissions, IPCC 2006 Volume 3, Tier 1.

These are the emissions a plant makes from its PROCESS rather than from burning
fuel, and they are usually the larger half of a cement works' or a steel mill's
inventory. Calcining limestone releases CO2 whatever heats the kiln. A nitric
acid plant makes N2O in the reaction itself. An aluminium cell makes CF4 and
C2F6 during an anode effect. None of them is a factor per unit of fuel, and
none can be left out of an inventory that claims to cover the site.

Implemented, with the chapter each came from:

  Ch 2  cement clinker, lime, glass, and the carbonates used as flux or raw
        material anywhere else
  Ch 3  ammonia, nitric acid, adipic acid, silicon and calcium carbide,
        titanium dioxide
  Ch 4  coke, sinter, pellet, iron, DRI and the three steelmaking routes;
        ferroalloys; aluminium anode CO2 and PFCs; magnesium SF6; lead; zinc

Every function returns a mass of gas, so the report applies the GWP set the
customer reports under. Parameters come from
`data/ipcc/industrial_processes.json`, which cites the table each came from, and
a process IPCC does not publish a factor for raises rather than returning zero.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional, Sequence

from ...quantities import D, ZERO
from ..errors import FactorNotPublished

PARAMETERS_PATH = (Path(__file__).resolve().parents[3]
                   / "data" / "ipcc" / "industrial_processes.json")


@dataclass(frozen=True)
class ProcessResult:
    """One process line, in kilograms of each gas it emits."""
    process: str
    gas_masses_kg: Mapping[str, Decimal]
    basis: str
    components: Mapping[str, Decimal] = field(default_factory=dict)
    notes: Sequence[str] = field(default_factory=tuple)


@dataclass(frozen=True)
class IndustrialParameters:
    source_name: str
    source_url: str
    read_from: str
    values: Mapping[str, object]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "IndustrialParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["source_name"], data["source_url"], data["read_from"], data)

    def group(self, name: str) -> Mapping[str, object]:
        try:
            return self.values[name]  # type: ignore[index]
        except KeyError:
            raise KeyError(
                f"No IPCC Volume 3 group named {name!r}. Groups: "
                f"{', '.join(k for k, v in self.values.items() if isinstance(v, dict))}."
            ) from None

    def factor(self, group: str, key: str, field_name: str = "value") -> Decimal:
        """One published factor, refusing anything the chapter does not give."""
        block = self.group(group)
        published = block.get("values", {})            # type: ignore[union-attr]
        missing = block.get("not_published", {})       # type: ignore[union-attr]
        if key in missing:
            raise FactorNotPublished(f"{missing[key]} (process {key!r})")
        try:
            entry = published[key]                     # type: ignore[index]
        except KeyError:
            raise KeyError(
                f"No Tier 1 factor for {key!r} in {group}. Published: "
                f"{', '.join(sorted(published))}."      # type: ignore[arg-type]
            ) from None
        if isinstance(entry, dict):
            return D(str(entry[field_name]))
        return D(str(entry))


def _tonnes_to_kg(tonnes: Decimal) -> Decimal:
    return tonnes * D(1000)


# --- Chapter 2: mineral industry -------------------------------------------

def cement_clinker_co2(
    clinker_tonnes: Decimal | str | float,
    *,
    kiln_dust_recycled: bool = False,
    cao_content: Optional[str] = None,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from calcining the raw meal into clinker, in kilograms.

    The activity is CLINKER, not cement. A plant that grinds imported clinker
    made none of this CO2, and a plant that exports clinker still made all of
    it — which is why applying a factor to cement tonnage is not good practice.

    `kiln_dust_recycled` drops the 2 percent correction for the CO2 that leaves
    in dust lost from the system; only set it where all the dust really does go
    back to the kiln.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("cement")
    factor_block = block["clinker_emission_factor"]      # type: ignore[index]

    if cao_content is not None:
        variants = block["cao_variants"]["values"]       # type: ignore[index]
        try:
            base = D(str(variants[cao_content]))
        except KeyError:
            raise KeyError(
                f"No clinker factor published for CaO content {cao_content!r}. "
                f"Published: {', '.join(variants)}."
            ) from None
    else:
        base = D(str(factor_block["base"]))

    correction = (D(1) if kiln_dust_recycled
                  else D(str(factor_block["kiln_dust_correction"])))
    co2 = D(clinker_tonnes) * base * correction

    notes = [
        "The activity is clinker, not cement: clinker bought in was calcined by whoever "
        "made it, and clinker sold on was still calcined here.",
    ]
    if kiln_dust_recycled:
        notes.append("No cement kiln dust correction applied, on the stated basis that all "
                     "the dust returns to the kiln.")
    return ProcessResult(
        process="cement_clinker",
        gas_masses_kg={"CO2": _tonnes_to_kg(co2)},
        basis=f"{base} tCO2 per tonne clinker x {correction} kiln dust correction",
        components={"clinker_tonnes": D(clinker_tonnes), "factor": base * correction},
        notes=tuple(notes),
    )


def lime_co2(
    lime_tonnes: Decimal | str | float,
    *,
    lime_type: str = "default_mix",
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from calcining limestone or dolomite into lime, in kilograms.

    This is lime MANUFACTURE. Lime spread on farmland is a different source and
    goes through the managed-soils chapter; counting it in both places doubles
    it.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("lime")
    if lime_type == "default_mix":
        factor = D(str(block["default_mix"]["value"]))   # type: ignore[index]
    else:
        factor = p.factor("lime", lime_type)

    return ProcessResult(
        process="lime_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(lime_tonnes) * factor)},
        basis=f"{factor} tCO2 per tonne of lime ({lime_type})",
        components={"lime_tonnes": D(lime_tonnes), "factor": factor},
        notes=("Lime made here. Lime applied to farmland is reported through managed "
               "soils instead, not twice.",),
    )


def glass_co2(
    glass_tonnes: Decimal | str | float,
    *,
    glass_type: Optional[str] = None,
    cullet_ratio: Optional[Decimal | str | float] = None,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from the carbonates in a glass batch, in kilograms.

    Cullet is recycled glass, which released its carbonate CO2 when it was first
    made, so only the virgin part of the batch emits. With no cullet ratio the
    IPCC Tier 1 assumption of 50 percent is used and said so.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("glass")
    tier1 = block["tier1_default"]                        # type: ignore[index]

    notes = []
    if glass_type is None:
        factor = D(str(tier1["emission_factor"]))
    else:
        factor = p.factor("glass", glass_type)

    if cullet_ratio is None:
        cullet = D(str(tier1["cullet_ratio"]))
        notes.append(f"No cullet ratio given, so IPCC's Tier 1 assumption of "
                     f"{cullet} was used. A measured ratio changes this materially.")
    else:
        cullet = D(cullet_ratio)
        if not (ZERO <= cullet < D(1)):
            raise ValueError(
                f"Cullet ratio must be at least 0 and under 1, got {cullet}. A batch that "
                f"was all cullet would have no carbonates to calcine at all.")

    effective = factor * (D(1) - cullet)
    return ProcessResult(
        process="glass_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(glass_tonnes) * effective)},
        basis=f"{factor} tCO2 per tonne glass x (1 - {cullet} cullet)",
        components={"glass_tonnes": D(glass_tonnes), "factor": factor,
                    "cullet_ratio": cullet, "effective_factor": effective},
        notes=tuple(notes),
    )


@dataclass(frozen=True)
class CarbonateInput:
    """One carbonate consumed, and how much of it actually calcined."""
    carbonate: str
    tonnes: Decimal | str | float
    fraction_calcined: Decimal | str | float = 1


def carbonate_co2(
    inputs: Sequence[CarbonateInput],
    *,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from carbonates calcined anywhere else — flux, soda ash, ceramics.

    The fraction calcined matters: carbonate that leaves the furnace unchanged
    has released nothing, and assuming full calcination overstates the source.
    """
    p = parameters or IndustrialParameters.load()
    total = ZERO
    components: dict[str, Decimal] = {}

    for item in inputs:
        fraction = D(item.fraction_calcined)
        if not (ZERO <= fraction <= D(1)):
            raise ValueError(
                f"{item.carbonate}: the calcined fraction must be between 0 and 1, "
                f"got {fraction}.")
        factor = p.factor("carbonates", item.carbonate)
        emitted = D(item.tonnes) * factor * fraction
        components[f"{item.carbonate}_tco2"] = emitted
        total += emitted

    return ProcessResult(
        process="carbonate_use",
        gas_masses_kg={"CO2": _tonnes_to_kg(total)},
        basis="Table 2.1 carbon dioxide content x the fraction calcined",
        components=components,
    )


# --- Chapter 3: chemical industry ------------------------------------------

def ammonia_co2(
    ammonia_tonnes: Decimal | str | float,
    *,
    process: str = "average_natural_gas",
    co2_recovered_tonnes: Decimal | str | float = 0,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from making ammonia, in kilograms.

    The factor covers the fuel AND the feedstock together, which is how ammonia
    is reported — so that fuel must not also be counted under stationary
    combustion. CO2 captured for urea manufacture leaves as urea rather than to
    air and is subtracted here; it is then released when the urea is applied,
    which the managed-soils chapter covers.
    """
    p = parameters or IndustrialParameters.load()
    factor = p.factor("ammonia", process)
    gross = D(ammonia_tonnes) * factor
    recovered = D(co2_recovered_tonnes)
    if recovered > gross:
        raise ValueError(
            f"More CO2 recovered ({recovered} t) than the process made ({gross} t). "
            f"Check the two figures cover the same plant and period.")

    notes = ["This factor counts the fuel and the feedstock together. Do not also report "
             "that fuel under stationary combustion."]
    if recovered > ZERO:
        notes.append("The recovered CO2 leaves as urea, not to air. It is released when the "
                     "urea is applied, which the managed soils method covers.")
    return ProcessResult(
        process="ammonia_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(gross - recovered)},
        basis=f"{factor} tCO2 per tonne NH3 ({process})",
        components={"gross_tco2": gross, "recovered_tco2": recovered},
        notes=tuple(notes),
    )


def nitric_acid_n2o(
    acid_tonnes: Decimal | str | float,
    *,
    plant_type: str,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """N2O from nitric acid manufacture, in kilograms.

    The tonnage is 100 percent pure acid. Reporting the weight of a solution as
    though it were pure acid overstates the source in proportion to its
    strength.
    """
    p = parameters or IndustrialParameters.load()
    factor = p.factor("nitric_acid", plant_type)
    return ProcessResult(
        process="nitric_acid_production",
        gas_masses_kg={"N2O": D(acid_tonnes) * factor},
        basis=f"{factor} kg N2O per tonne of 100 percent acid ({plant_type})",
        components={"acid_tonnes": D(acid_tonnes), "factor": factor},
        notes=("The tonnage must be on a 100 percent HNO3 basis.",),
    )


def adipic_acid_n2o(
    acid_tonnes: Decimal | str | float,
    *,
    abatement: Optional[str] = None,
    destruction_factor: Optional[Decimal | str | float] = None,
    utilisation_factor: Optional[Decimal | str | float] = None,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """N2O from adipic acid manufacture, in kilograms.

    Abatement is two numbers, not one: how much the technology destroys when it
    runs, and how much of the year it ran. Multiplying only by the destruction
    factor assumes the unit never went down, which understates the source.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("adipic_acid")
    generated = D(acid_tonnes) * D(str(block["generation_factor"]["value"]))  # type: ignore[index]

    if abatement is None:
        abated = ZERO
        notes = ("No abatement recorded, so the uncontrolled generation factor stands.",)
    else:
        destruction_table = block["destruction_factor"]["values"]   # type: ignore[index]
        utilisation_table = block["utilisation_factor"]["values"]   # type: ignore[index]
        if abatement not in destruction_table:
            raise KeyError(
                f"No published destruction factor for {abatement!r}. Published: "
                f"{', '.join(sorted(destruction_table))}.")
        destruction = (D(destruction_factor) if destruction_factor is not None
                       else D(str(destruction_table[abatement])))
        utilisation = (D(utilisation_factor) if utilisation_factor is not None
                       else D(str(utilisation_table[abatement])))
        for name, value in (("destruction", destruction), ("utilisation", utilisation)):
            if not (ZERO <= value <= D(1)):
                raise ValueError(f"The {name} factor must be between 0 and 1, got {value}.")
        abated = generated * destruction * utilisation
        notes = (f"Abatement is {destruction} destroyed while running, times {utilisation} "
                 f"of the year running. Using the destruction factor alone would assume "
                 f"the unit never stopped.",)

    return ProcessResult(
        process="adipic_acid_production",
        gas_masses_kg={"N2O": generated - abated},
        basis="300 kg N2O per tonne, less what abatement actually removed",
        components={"generated_kg_n2o": generated, "abated_kg_n2o": abated},
        notes=notes,
    )


def carbide_emissions(
    tonnes: Decimal | str | float,
    *,
    carbide: str = "calcium_carbide",
    basis: str = "product",
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 and, for silicon carbide, CH4 from carbide manufacture, in kilograms.

    `basis` says what the tonnage is: the carbide 'product', the 'petroleum_coke'
    that went in, or for calcium carbide the 'carbide_used' to make acetylene,
    which releases its carbon downstream of making it.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("carbide")
    try:
        entry = block[carbide]                          # type: ignore[index]
    except KeyError:
        raise KeyError(
            f"No published carbide factors for {carbide!r}. Published: "
            f"{', '.join(k for k in block if isinstance(block[k], dict))}."  # type: ignore[index]
        ) from None

    co2_key = {"product": "co2_per_tonne_product",
               "petroleum_coke": "co2_per_tonne_petroleum_coke",
               "carbide_used": "co2_per_tonne_carbide_used"}.get(basis)
    if co2_key is None or co2_key not in entry:
        raise KeyError(
            f"{carbide} publishes no CO2 factor on a {basis!r} basis. Available: "
            f"{', '.join(k.replace('co2_per_tonne_', '') for k in entry if k.startswith('co2_'))}.")

    quantity = D(tonnes)
    gases: dict[str, Decimal] = {"CO2": _tonnes_to_kg(quantity * D(str(entry[co2_key])))}

    ch4_key = ("ch4_kg_per_tonne_product" if basis == "product"
               else "ch4_kg_per_tonne_petroleum_coke")
    if ch4_key in entry:
        gases["CH4"] = quantity * D(str(entry[ch4_key]))

    return ProcessResult(
        process=f"{carbide}_production",
        gas_masses_kg=gases,
        basis=f"per tonne of {basis.replace('_', ' ')}",
        components={"tonnes": quantity},
    )


def titanium_dioxide_co2(
    product_tonnes: Decimal | str | float,
    *,
    product: str = "rutile_tio2_chloride_route",
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from titanium dioxide manufacture, in kilograms."""
    p = parameters or IndustrialParameters.load()
    factor = p.factor("titanium_dioxide", product)
    return ProcessResult(
        process="titanium_dioxide_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(product_tonnes) * factor)},
        basis=f"{factor} tCO2 per tonne ({product})",
        components={"product_tonnes": D(product_tonnes), "factor": factor},
    )


# --- Chapter 4: metal industry ---------------------------------------------

@dataclass(frozen=True)
class SteelStep:
    """One step of an iron and steel works, and its output in tonnes."""
    step: str
    tonnes: Decimal | str | float


def iron_and_steel_emissions(
    steps: Sequence[SteelStep],
    *,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 and CH4 from coke, sinter, iron and steelmaking, in kilograms.

    Be careful not to count the same carbon twice: the BOF and open hearth
    factors already include the blast furnace iron making, so a works that
    reports both pig iron and BOF steel has counted its iron twice. The EAF
    factor is for steel from SCRAP and does not apply to a furnace charged with
    pig iron.
    """
    p = parameters or IndustrialParameters.load()
    co2 = ch4 = ZERO
    components: dict[str, Decimal] = {}
    named = {step.step for step in steps}

    for step in steps:
        entry = p.group("iron_and_steel")["values"]      # type: ignore[index]
        if step.step not in entry:
            raise KeyError(
                f"No Tier 1 factor for the step {step.step!r}. Steps: "
                f"{', '.join(sorted(entry))}.")
        detail = entry[step.step]
        quantity = D(step.tonnes)
        emitted = quantity * D(str(detail["co2"]))
        components[f"{step.step}_tco2"] = emitted
        co2 += emitted
        if "ch4_kg" in detail:
            ch4 += quantity * D(str(detail["ch4_kg"]))

    notes = []
    if ("pig_iron_blast_furnace" in named
            and named & {"steel_basic_oxygen_furnace", "steel_open_hearth_furnace"}):
        notes.append(
            "Pig iron is reported alongside BOF or open hearth steel. Those steelmaking "
            "factors already include the blast furnace iron making, so this counts the "
            "same carbon twice — report the iron or the steel, not both.")

    return ProcessResult(
        process="iron_and_steel",
        gas_masses_kg={"CO2": _tonnes_to_kg(co2), "CH4": ch4},
        basis="Tables 4.1 and 4.2, per tonne of each product",
        components=components,
        notes=tuple(notes),
    )


def ferroalloy_co2(
    product_tonnes: Decimal | str | float,
    *,
    alloy: str,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from ferroalloy manufacture, in kilograms."""
    p = parameters or IndustrialParameters.load()
    factor = p.factor("ferroalloys", alloy)
    return ProcessResult(
        process="ferroalloy_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(product_tonnes) * factor)},
        basis=f"{factor} tCO2 per tonne ({alloy})",
        components={"product_tonnes": D(product_tonnes), "factor": factor},
        notes=("These factors assume fossil reductants. A furnace charged with charcoal or "
               "other bio-carbon needs its own figure.",),
    )


def aluminium_emissions(
    aluminium_tonnes: Decimal | str | float,
    *,
    cell_technology: str,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from the anode and PFCs from anode effects, in kilograms.

    `cell_technology` is one of cwpb, swpb, vss or hss. The CO2 factor follows
    from whether the cell is prebake or Soderberg.
    """
    p = parameters or IndustrialParameters.load()
    block = p.group("aluminium")
    technology = cell_technology.lower()

    pfc_table = block["pfc"]["values"]                    # type: ignore[index]
    if technology not in pfc_table:
        raise KeyError(
            f"No published PFC factors for cell technology {cell_technology!r}. "
            f"Published: {', '.join(sorted(pfc_table))}.")

    anode_table = block["anode_co2"]["values"]            # type: ignore[index]
    anode_kind = "prebake" if technology in ("cwpb", "swpb") else "soderberg"
    quantity = D(aluminium_tonnes)

    co2 = quantity * D(str(anode_table[anode_kind]["value"]))
    cf4 = quantity * D(str(pfc_table[technology]["cf4"]))
    c2f6 = quantity * D(str(pfc_table[technology]["c2f6"]))

    return ProcessResult(
        process="aluminium_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(co2), "CF4": cf4, "C2F6": c2f6},
        basis=f"anode {anode_kind}, PFCs {technology.upper()}",
        components={"aluminium_tonnes": quantity, "anode_tco2": co2},
        notes=("The Tier 1 PFC factors carry an uncertainty from -99 to +380 percent. A "
               "smelter that records anode effect minutes should use the Tier 2 slope "
               "coefficients instead.",),
    )


def magnesium_sf6(
    magnesium_tonnes: Decimal | str | float,
    *,
    sf6_consumed_kg: Optional[Decimal | str | float] = None,
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """SF6 from magnesium casting cover gas, in kilograms.

    Where the foundry knows how much SF6 it bought, that is the better figure:
    the Tier 1 assumption is simply that all of it is emitted.
    """
    p = parameters or IndustrialParameters.load()
    if sf6_consumed_kg is not None:
        emitted = D(sf6_consumed_kg)
        basis = "SF6 purchased, all of it assumed emitted"
        notes = ("All SF6 bought as cover gas is assumed emitted within the year.",)
    else:
        factor = p.factor("magnesium", "all_casting_processes")
        emitted = D(magnesium_tonnes) * factor
        basis = f"{factor} kg SF6 per tonne of magnesium cast"
        notes = ("Casting SF6 varies by orders of magnitude between foundries. Record the "
                 "gas actually purchased where you can.",)

    return ProcessResult(
        process="magnesium_casting",
        gas_masses_kg={"SF6": emitted},
        basis=basis,
        components={"magnesium_tonnes": D(magnesium_tonnes)},
        notes=notes,
    )


def lead_co2(
    lead_tonnes: Decimal | str | float,
    *,
    route: str = "default_mix",
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from lead production, in kilograms."""
    p = parameters or IndustrialParameters.load()
    factor = p.factor("lead", route)
    notes = ()
    if route == "default_mix":
        notes = ("The default weights 80 percent Imperial Smelting and 20 percent direct "
                 "smelting. Where the split is known, name the route instead.",)
    return ProcessResult(
        process="lead_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(lead_tonnes) * factor)},
        basis=f"{factor} tCO2 per tonne of lead ({route})",
        components={"lead_tonnes": D(lead_tonnes), "factor": factor},
        notes=notes,
    )


def zinc_co2(
    zinc_tonnes: Decimal | str | float,
    *,
    process: str = "default_mix",
    parameters: Optional[IndustrialParameters] = None,
) -> ProcessResult:
    """CO2 from zinc production, in kilograms."""
    p = parameters or IndustrialParameters.load()
    factor = p.factor("zinc", process)
    notes = ()
    if process == "default_mix":
        notes = ("The default weights 60 percent Imperial Smelting and 40 percent Waelz "
                 "kiln. Where the process is known, name it instead.",)
    return ProcessResult(
        process="zinc_production",
        gas_masses_kg={"CO2": _tonnes_to_kg(D(zinc_tonnes) * factor)},
        basis=f"{factor} tCO2 per tonne of zinc ({process})",
        components={"zinc_tonnes": D(zinc_tonnes), "factor": factor},
        notes=notes,
    )
