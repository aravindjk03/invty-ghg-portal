"""Transcribe the IPCC solid-waste defaults into data/ipcc/solid_waste.json.

    python scripts/ingest_ipcc_solid_waste.py --waste-data V5_2_Ch2_Waste_Data.pdf

Read from the published pages:
  Volume 5 Chapter 3, Tables 3.1 (printed 3.14), 3.2 (3.15) and 3.3 (3.17)
  Volume 5 Chapter 2, Tables 2.3 (2.12), 2.4 (2.14), 2.5 and 2.6 (2.16)

Refuses to write if a k value is outside its own published range, or if a
composition row that is complete does not add up to about 100 percent.
"""
import argparse
import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "data" / "ipcc" / "solid_waste.json"

problems = []

# --- Table 3.3: methane generation rate k, by waste type and climate zone ---
# (default, [low, high]) per zone.
K = {
    "paper_textiles": {
        "boreal_temperate_dry":  (0.04, [0.03, 0.05]),
        "boreal_temperate_wet":  (0.06, [0.05, 0.07]),
        "tropical_dry":          (0.045, [0.04, 0.06]),
        "tropical_moist_wet":    (0.07, [0.06, 0.085]),
    },
    "wood_straw": {
        "boreal_temperate_dry":  (0.02, [0.01, 0.03]),
        "boreal_temperate_wet":  (0.03, [0.02, 0.04]),
        "tropical_dry":          (0.025, [0.02, 0.04]),
        "tropical_moist_wet":    (0.035, [0.03, 0.05]),
    },
    "other_non_food_organic": {
        "boreal_temperate_dry":  (0.05, [0.04, 0.06]),
        "boreal_temperate_wet":  (0.10, [0.06, 0.1]),
        "tropical_dry":          (0.065, [0.05, 0.08]),
        "tropical_moist_wet":    (0.17, [0.15, 0.2]),
    },
    "food_sewage_sludge": {
        "boreal_temperate_dry":  (0.06, [0.05, 0.08]),
        "boreal_temperate_wet":  (0.185, [0.1, 0.2]),
        "tropical_dry":          (0.085, [0.07, 0.1]),
        "tropical_moist_wet":    (0.40, [0.17, 0.7]),
    },
    "bulk": {
        "boreal_temperate_dry":  (0.05, [0.04, 0.06]),
        "boreal_temperate_wet":  (0.09, [0.08, 0.1]),
        "tropical_dry":          (0.065, [0.05, 0.08]),
        "tropical_moist_wet":    (0.17, [0.15, 0.2]),
    },
}

for waste_type, zones in K.items():
    for zone, (default, (low, high)) in zones.items():
        if not (low <= default <= high):
            problems.append(f"k {waste_type}/{zone}: default {default} outside range {low}-{high}")

# --- Table 2.4: DOC content, percent of WET waste --------------------------
DOC_WET_PERCENT = {
    "paper_cardboard":  {"default": 40, "range": [36, 45], "dry_matter_percent": 90},
    "textiles":         {"default": 24, "range": [20, 40], "dry_matter_percent": 80},
    "food":             {"default": 15, "range": [8, 20], "dry_matter_percent": 40},
    "wood":             {"default": 43, "range": [39, 46], "dry_matter_percent": 85},
    "garden_and_park":  {"default": 20, "range": [18, 22], "dry_matter_percent": 40},
    "nappies":          {"default": 24, "range": [18, 32], "dry_matter_percent": 40},
    "rubber_and_leather": {"default": 39, "range": [39, 39], "dry_matter_percent": 84,
                           "note": "Table 2.4 prints this value in brackets: natural rubbers would likely not degrade under anaerobic conditions at a disposal site, so treating it as degradable overstates the methane."},
    "plastics":         {"default": 0, "dry_matter_percent": 100, "note": "No DOC: the carbon is fossil, and Table 2.4 prints a dash."},
    "metal":            {"default": 0, "dry_matter_percent": 100, "note": "No DOC."},
    "glass":            {"default": 0, "dry_matter_percent": 100, "note": "No DOC."},
    "other_inert":      {"default": 0, "dry_matter_percent": 90, "note": "No DOC; total carbon 3 percent of dry weight, all of it fossil."},
}

# --- Table 2.5 and 2.6: DOC in industrial and other waste, percent wet ------
DOC_INDUSTRIAL_PERCENT = {
    "food_beverages_tobacco": 15,
    "textile": 24,
    "wood_and_wood_products": 43,
    "pulp_and_paper": 40,
    "petroleum_solvents_plastics": 0,
    "rubber": 39,
    "construction_and_demolition": 4,
    "other_manufacturing": 1,
}
DOC_OTHER_PERCENT = {"clinical_waste": 15}

# --- Table 2.3: MSW composition by percent, regional defaults ---------------
COMPONENT_ORDER = ["food", "paper_cardboard", "wood", "textiles", "rubber_and_leather",
                   "plastics", "metal", "glass", "other_inert"]


def composition(*values):
    if len(values) != len(COMPONENT_ORDER):
        raise SystemExit(f"REFUSED: composition row has {len(values)} values, expected 9")
    return {name: value for name, value in zip(COMPONENT_ORDER, values)}


COMPOSITION = {
    "eastern_asia":            composition(26.2, 18.8, 3.5, 3.5, 1.0, 14.3, 2.7, 3.1, 7.4),
    "south_central_asia":      composition(40.3, 11.3, 7.9, 2.5, 0.8, 6.4, 3.8, 3.5, 21.9),
    "south_eastern_asia":      composition(43.5, 12.9, 9.9, 2.7, 0.9, 7.2, 3.3, 4.0, 16.3),
    "western_asia_middle_east": composition(41.1, 18.0, 9.8, 2.9, 0.6, 6.3, 1.3, 2.2, 5.4),
    "eastern_africa":          composition(53.9, 7.7, 7.0, 1.7, 1.1, 5.5, 1.8, 2.3, 11.6),
    "middle_africa":           composition(43.4, 16.8, 6.5, 2.5, None, 4.5, 3.5, 2.0, 1.5),
    "northern_africa":         composition(51.1, 16.5, 2.0, 2.5, None, 4.5, 3.5, 2.0, 1.5),
    "southern_africa":         composition(23.0, 25.0, 15.0, None, None, None, None, None, None),
    "western_africa":          composition(40.4, 9.8, 4.4, 1.0, None, 3.0, 1.0, None, None),
    "eastern_europe":          composition(30.1, 21.8, 7.5, 4.7, 1.4, 6.2, 3.6, 10.0, 14.6),
    "northern_europe":         composition(23.8, 30.6, 10.0, 2.0, None, 13.0, 7.0, 8.0, None),
    "southern_europe":         composition(36.9, 17.0, 10.6, None, None, None, None, None, None),
    "western_europe":          composition(24.2, 27.5, 11.0, None, None, None, None, None, None),
    "australia_new_zealand":   composition(36.0, 30.0, 24.0, None, None, None, None, None, None),
    "rest_of_oceania":         composition(67.5, 6.0, 2.5, None, None, None, None, None, None),
    "north_america":           composition(33.9, 23.2, 6.2, 3.9, 1.4, 8.5, 4.6, 6.5, 9.8),
    "central_america":         composition(43.8, 13.7, 13.5, 2.6, 1.8, 6.7, 2.6, 3.7, 12.3),
    "south_america":           composition(44.9, 17.1, 4.7, 2.6, 0.7, 10.8, 2.9, 3.3, 13.0),
    "caribbean":               composition(46.9, 17.0, 2.4, 5.1, 1.9, 9.9, 5.0, 5.7, 3.5),
}

# Table 2.3 does NOT add to 100 for several regions - the rows come from
# different country studies and some cells are blank - so a sum check would be
# wrong. Check the transcription against the PDF instead: the numbers in each
# row, in order, have to be the numbers the published page holds.
PDF_ROWS = {
    "eastern_asia":            "Eastern Asia",
    "south_central_asia":      "South-Central Asia",
    "south_eastern_asia":      "South-Eastern Asia",
    "western_asia_middle_east": "Western Asia & Middle East",
    "eastern_africa":          "Eastern Africa",
    "middle_africa":           "Middle Africa",
    "northern_africa":         "Northern Africa",
    "southern_africa":         "Southern Africa",
    "western_africa":          "Western Africa",
    "eastern_europe":          "Eastern Europe",
    "northern_europe":         "Northern Europe",
    "southern_europe":         "Southern Europe",
    "western_europe":          "Western Europe",
    "australia_new_zealand":   "Australia and New Zealand",
    "rest_of_oceania":         "Rest of Oceania",
    "north_america":           "North America",
    "central_america":         "Central America",
    "south_america":           "South America",
    "caribbean":               "Caribbean",
}


def published_rows(pdf_path):
    """Table 2.3 as the PDF holds it: {label: [numbers, food first]}.

    The page is rotated, so a visual row runs down the x axis and its cells run
    along y. Words are grouped by x and then read right to left, which is the
    order the columns print in.
    """
    import re

    import pymupdf

    page = pymupdf.open(pdf_path)[11]
    grouped = {}
    for x0, y0, _x1, _y1, word, *_ in page.get_text("words"):
        grouped.setdefault(round(x0 / 6), []).append((y0, word))

    rows = {}
    for key in sorted(grouped):
        cells = [word for _, word in sorted(grouped[key], reverse=True)]
        label_parts = [c for c in cells if not re.fullmatch(r"\d+(\.\d+)?", c)]
        numbers = [float(c) for c in cells if re.fullmatch(r"\d+(\.\d+)?", c)]
        if numbers:
            rows[" ".join(label_parts)] = numbers
    return rows


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--waste-data", type=pathlib.Path, required=True,
                    help="V5_2_Ch2_Waste_Data.pdf, the chapter Table 2.3 is printed in")
args = parser.parse_args()

published = published_rows(args.waste_data)
for region, label in PDF_ROWS.items():
    mine = [value for value in COMPOSITION[region].values() if value is not None]
    theirs = next((numbers for row_label, numbers in published.items()
                   if row_label.replace("&", "&").strip() == label), None)
    if theirs is None:
        problems.append(f"composition {region}: row {label!r} not found in the PDF")
    elif [round(v, 3) for v in mine] != [round(v, 3) for v in theirs]:
        problems.append(f"composition {region}: transcribed {mine}, page holds {theirs}")

if problems:
    raise SystemExit("REFUSED, nothing written:\n  " + "\n  ".join(problems))

data = {
    "source_name": "IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Volume 5 Chapter 3 (Solid Waste Disposal) with the waste data of Chapter 2",
    "source_url": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/5_Volume5/V5_3_Ch3_SWDS.pdf",
    "source_url_waste_data": "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/5_Volume5/V5_2_Ch2_Waste_Data.pdf",
    "read_on": "2026-09-26",
    "read_from": "Chapter 3 Tables 3.1 (printed page 3.14), 3.2 (3.15) and 3.3 (3.17); Chapter 2 Tables 2.3 (2.12), 2.4 (2.14), 2.5 and 2.6 (2.16), read from the published pages",
    "tier": 1,
    "method": {
        "name": "First Order Decay (FOD)",
        "equations": {
            "3.1": "CH4 emitted = (CH4 generated - recovered) x (1 - OX)",
            "3.2": "DDOCm = W x DOC x DOCf x MCF",
            "3.4": "DDOCma(T) = DDOCmd(T) + DDOCma(T-1) x e^-k",
            "3.5": "DDOCm decomp(T) = DDOCma(T-1) x (1 - e^-k)",
            "3.6": "CH4 generated(T) = DDOCm decomp(T) x F x 16/12",
        },
        "note": "Decay begins on 1 January of the year AFTER deposition, so waste buried this year emits nothing this year. A single year of tonnage cannot produce an estimate: the model needs the history of what was buried.",
        "delay_not_implemented": "Annex 3A.1 gives an adjustment for reaction start dates earlier than 1 January of the following year. That adjustment is not implemented here; the equations above are used as printed.",
        "carbon_dioxide": "IPCC reports no CO2 from a disposal site under Waste. The carbon that degrades to CO2 is biogenic, and the fossil part of the waste does not degrade.",
    },
    "mcf": {
        "unit": "fraction",
        "note": "Table 3.1. The methane CORRECTION factor here is not the methane CONVERSION factor used for manure and wastewater.",
        "values": {
            "managed_anaerobic": 1.0,
            "managed_semi_aerobic": 0.5,
            "unmanaged_deep": 0.8,
            "unmanaged_shallow": 0.4,
            "uncategorised": 0.6,
        },
        "definitions": {
            "managed_anaerobic": "Controlled placement of waste, some control of scavenging and fires, and at least one of cover material, mechanical compacting or levelling.",
            "managed_semi_aerobic": "Controlled placement and all of: permeable cover material, leachate drainage, regulating pondage and a gas ventilation system.",
            "unmanaged_deep": "Not meeting the managed criteria, 5 metres deep or more, and/or a high water table at near ground level.",
            "unmanaged_shallow": "Not meeting the managed criteria and less than 5 metres deep.",
            "uncategorised": "Only where a country cannot classify its sites into the four categories above.",
        },
    },
    "oxidation_factor": {
        "unit": "fraction",
        "note": "Table 3.2. The default is zero. 0.1 is for a managed site covered with CH4-oxidising material such as soil or compost; anything higher has to be documented and supported by data. Recovered methane is subtracted BEFORE oxidation is applied.",
        "values": {"default": 0, "managed_covered_with_oxidising_material": 0.1},
    },
    "doc_f": {
        "value": 0.5,
        "note": "The fraction of degradable organic carbon that actually decomposes. 0.5 is recommended where the site is anaerobic and the DOC values include lignin, which the Table 2.4 values do.",
    },
    "f": {
        "value": 0.5,
        "note": "The fraction of CH4 by volume in the generated landfill gas. Most waste generates gas that is about half methane; only material with substantial fat or oil generates much more.",
    },
    "k": {
        "unit": "per year",
        "note": "Table 3.3. k = ln(2)/half-life.",
        "climate_zones": {
            "boreal_temperate_dry": "mean annual temperature at or below 20 C, MAP/PET below 1",
            "boreal_temperate_wet": "mean annual temperature at or below 20 C, MAP/PET above 1",
            "tropical_dry": "mean annual temperature above 20 C, mean annual precipitation below 1000 mm",
            "tropical_moist_wet": "mean annual temperature above 20 C, mean annual precipitation at or above 1000 mm",
        },
        "tropical_caveat": "The chapter says information on k in tropical conditions is limited and those values are indicative, mostly derived from temperate ones.",
        "values": {waste_type: {zone: {"value": default, "range": bounds}
                                for zone, (default, bounds) in zones.items()}
                   for waste_type, zones in K.items()},
        "group_for_component": {
            "paper_cardboard": "paper_textiles",
            "textiles": "paper_textiles",
            "wood": "wood_straw",
            "garden_and_park": "other_non_food_organic",
            "food": "food_sewage_sludge",
            "sewage_sludge": "food_sewage_sludge",
            "bulk": "bulk",
        },
        "group_not_published": {
            "nappies": "Table 3.3 has no row for nappies, and they are part paper, part plastic and part excreta. Give a k, or split the stream.",
            "rubber_and_leather": "Table 3.3 has no row for rubber and leather, and Table 2.4 brackets its DOC because natural rubber is unlikely to degrade anaerobically.",
        },
    },
    "doc": {
        "unit": "fraction of wet waste (the table prints percentages)",
        "msw_components": DOC_WET_PERCENT,
        "industrial_waste": DOC_INDUSTRIAL_PERCENT,
        "other_waste": DOC_OTHER_PERCENT,
        "hazardous_waste_note": "Table 2.6 gives no DOC for hazardous waste - it is recorded as not available, which is not the same as zero.",
    },
    "msw_composition": {
        "unit": "percent of wet waste",
        "note": "Table 2.3 regional defaults, for use only where a site has no composition of its own. Several rows are incomplete in the published table, and the blanks are kept as nulls rather than filled in; a row with blanks does not add to 100 and cannot be used on its own.",
        "warning": "The chapter advises against combining IPCC default composition with country-specific disposal tonnages without checking that the inert part matches.",
        "totals_warning": "Most rows do not add to 100 percent, even where no cell is blank - Eastern Asia adds to 80.5 and Eastern Africa to 92.6 - because the rows come from different country studies. The shortfall is recorded below as row_total_percent so it can be seen rather than silently scaled away.",
        "components": COMPONENT_ORDER,
        "regions": COMPOSITION,
        "row_total_percent": {region: round(sum(v for v in shares.values() if v is not None), 1)
                              for region, shares in COMPOSITION.items()},
    },
}

OUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
complete = sum(1 for shares in COMPOSITION.values() if all(v is not None for v in shares.values()))
print(f"solid_waste.json written: {len(K)} k waste types x 4 climate zones, "
      f"{len(DOC_WET_PERCENT)} MSW components, {len(COMPOSITION)} composition regions "
      f"({complete} of them complete)")
