"""Chemical safety data for a named substance, from PubChem.

A Product Carbon estimate says what a material costs the climate. It says
nothing about whether the material will burn, corrode or poison the person
handling it, and for a plant buying solvents or acids that is the question
asked first. This looks the substance up in PubChem and returns what the NIH
actually publishes for it: the GHS signal word, the hazard statements, the
precautionary codes and the identifiers that let someone find the full safety
data sheet.

Three things it will not do, because each would be worse than returning
nothing:

  - It does not guess. "Cotton T-shirt" is a product, not a substance, and no
    CID matches it. The answer says so rather than offering the hazards of
    something with a similar name.
  - It does not summarise or reword a hazard statement. H225 is quoted as
    published, with its code, so it can be checked against the label.
  - It is not a safety data sheet and does not claim to be. The response says
    so, every time, because the legal document is the supplier's SDS and
    nothing here replaces it.

PubChem is a public NIH service and needs no key. It asks for no more than five
requests a second, which one user typing a name never approaches; answers are
cached so a repeated lookup costs nothing.
"""
from __future__ import annotations

import http.client
import json
import re
import threading
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Optional, Sequence

PUBCHEM_HOST = "pubchem.ncbi.nlm.nih.gov"
PUBCHEM_ROOT = "/rest"
USER_AGENT = "IINVTY-GHG-Portal/1.0 (chemical safety lookup)"
TIMEOUT_SECONDS = 15.0

#: PubChem asks for no more than five requests a second.
_MIN_INTERVAL = 0.25
_MAX_RETRIES = 2
_RETRY_PAUSE_SECONDS = 1.5
_last_call = 0.0
_throttle = threading.Lock()

#: A lookup is deterministic and PubChem changes slowly, so answers are kept
#: for the life of the process rather than asked for again on every keystroke.
_cache: dict[str, "ChemicalSafety"] = {}
_cache_lock = threading.Lock()

NOT_A_SAFETY_DATA_SHEET = (
    "This is a summary of what PubChem publishes, not a safety data sheet. The legal "
    "document for a substance you actually hold is the SDS your supplier issues for that "
    "product, and it governs how it is stored, handled and disposed of."
)


class ChemicalSafetyUnavailable(RuntimeError):
    """PubChem could not be reached. Not the same as 'no hazards'."""


@dataclass(frozen=True)
class HazardStatement:
    """One GHS hazard, as published: the code and the sentence that goes with it."""
    code: str
    statement: str


@dataclass(frozen=True)
class ChemicalSafety:
    """What PubChem holds for one substance."""
    query: str
    matched: bool
    cid: Optional[int] = None
    name: Optional[str] = None
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[str] = None
    signal_word: Optional[str] = None
    hazard_statements: Sequence[HazardStatement] = field(default_factory=tuple)
    precautionary_codes: Sequence[str] = field(default_factory=tuple)
    source_url: Optional[str] = None
    notes: Sequence[str] = field(default_factory=tuple)


def _get(path: str, attempt: int = 0) -> Optional[dict]:
    """One PubChem call. Returns None for 'no such record', raises if it is down.

    PubChem answers 503 PUGREST.ServerBusy when it is throttling, and asks for
    a pause - often thirty seconds, far longer than a web request should be
    held open. One short retry, then say plainly that it is busy, because
    "unavailable" would read as "no hazards found".

    Known: PubChem's edge refuses Python's HTTP clients from some addresses
    while serving curl from the same machine in the same second. It is not a
    rate limit in that case and no retry helps; the message is still the right
    one, because a reader must never take "we could not ask" for "nothing was
    found".
    """
    global _last_call
    with _throttle:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()

    connection = http.client.HTTPSConnection(PUBCHEM_HOST, timeout=TIMEOUT_SECONDS)
    try:
        connection.request("GET", f"{PUBCHEM_ROOT}{path}",
                           headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        response = connection.getresponse()
        status = response.status
        body = response.read()
        retry_after = response.getheader("Retry-After")
    except (OSError, http.client.HTTPException) as error:
        raise ChemicalSafetyUnavailable(
            f"PubChem could not be reached ({error.__class__.__name__}). No safety data "
            f"could be shown; this is not a statement that the substance is safe."
        ) from None
    finally:
        connection.close()

    if status == 404:
        return None                      # PubChem holds nothing under that name
    if status == 503:
        if attempt < _MAX_RETRIES:
            time.sleep(_RETRY_PAUSE_SECONDS)
            return _get(path, attempt + 1)
        after = f" It asked for {retry_after} seconds." if retry_after else ""
        raise ChemicalSafetyUnavailable(
            f"PubChem is rate-limiting requests right now, so no safety data could be "
            f"shown.{after} Try again shortly. This is not a finding that the substance "
            f"is safe.")
    if status != 200:
        raise ChemicalSafetyUnavailable(
            f"PubChem answered {status}. No safety data could be shown; this is not a "
            f"statement that the substance is safe.")

    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ChemicalSafetyUnavailable(
            "PubChem returned something that was not the JSON expected, so no safety data "
            "could be shown.") from None


def _section(node: dict, heading: str) -> Optional[dict]:
    for section in node.get("Section", []):
        if section.get("TOCHeading") == heading:
            return section
        found = _section(section, heading)
        if found:
            return found
    return None


def _strings(information: dict) -> list[str]:
    return [item.get("String", "") for item in
            information.get("Value", {}).get("StringWithMarkup", [])
            if item.get("String")]


#: "H225 (> 99.9%): Highly Flammable liquid and vapor [Danger Flammable liquids]"
#: PubChem appends the share of reporting companies and the GHS category in
#: brackets. Both are kept out of the sentence but the code and wording are
#: quoted exactly, so they can be checked against a label.
_HAZARD = re.compile(r"^\s*(H\d{3}[A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*(.+?)\s*(?:\[[^\]]*\])?\s*$")


def _parse_hazards(section: dict) -> tuple[Optional[str], list[HazardStatement], list[str]]:
    """The first GHS block PubChem lists, which is its aggregated classification."""
    signal: Optional[str] = None
    hazards: list[HazardStatement] = []
    precautionary: list[str] = []
    seen: set[str] = set()

    for information in section.get("Information", []):
        name = information.get("Name")
        if name == "Signal" and signal is None:
            values = _strings(information)
            signal = values[0] if values else None
        elif name == "GHS Hazard Statements":
            for line in _strings(information):
                match = _HAZARD.match(line)
                if not match:
                    continue
                code, statement = match.group(1), match.group(2)
                if code in seen:
                    continue
                seen.add(code)
                hazards.append(HazardStatement(code=code, statement=statement))
        elif name == "Precautionary Statement Codes" and not precautionary:
            for line in _strings(information):
                precautionary = sorted(set(re.findall(r"P\d{3}(?:\+P\d{3})*", line)))

    return signal, hazards, precautionary


def look_up(name: str) -> ChemicalSafety:
    """What PubChem publishes for a substance, or an honest 'no match'."""
    query = " ".join(name.split())
    if not query:
        return ChemicalSafety(query=name, matched=False,
                              notes=("Give the name of a substance to look up.",))

    key = query.lower()
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return cached

    encoded = urllib.parse.quote(query, safe="")
    properties = _get(
        f"/pug/compound/name/{encoded}/property/"
        f"MolecularFormula,MolecularWeight,IUPACName/JSON")

    if not properties:
        result = ChemicalSafety(
            query=query, matched=False,
            notes=("PubChem holds no substance under that name. A product - a T-shirt, a "
                   "bag of cement - is not a substance and will not match; look up the "
                   "material or solvent itself. Nothing here means the item is safe.",))
        with _cache_lock:
            _cache[key] = result
        return result

    record = properties["PropertyTable"]["Properties"][0]
    cid = int(record["CID"])

    signal: Optional[str] = None
    hazards: list[HazardStatement] = []
    precautionary: list[str] = []
    notes = [NOT_A_SAFETY_DATA_SHEET]

    ghs = _get(f"/pug_view/data/compound/{cid}/JSON?heading=GHS+Classification")
    section = _section(ghs.get("Record", {}), "GHS Classification") if ghs else None
    if section:
        signal, hazards, precautionary = _parse_hazards(section)
    if not hazards:
        notes.append(
            "PubChem lists no GHS classification for this substance. That means nobody has "
            "filed one there - it is not a finding that the substance is harmless.")

    result = ChemicalSafety(
        query=query,
        matched=True,
        cid=cid,
        name=record.get("IUPACName") or query,
        molecular_formula=record.get("MolecularFormula"),
        molecular_weight=record.get("MolecularWeight"),
        signal_word=signal,
        hazard_statements=tuple(hazards),
        precautionary_codes=tuple(precautionary),
        source_url=f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
        notes=tuple(notes),
    )
    with _cache_lock:
        _cache[key] = result
    return result
