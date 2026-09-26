"""Chemical safety lookups against PubChem.

The payloads below are recorded from real PubChem responses, so the parsing is
tested without depending on a public service being reachable — PubChem
rate-limits by address and answers 503 PUGREST.ServerBusy under load, which
would make a network-dependent test fail for reasons that have nothing to do
with this code.

What matters here is what the module refuses to do: guess at a name it cannot
match, reword a hazard statement, or let "PubChem is busy" read as "no hazards".
"""
import pytest

from service import chemical_safety
from service.chemical_safety import ChemicalSafetyUnavailable, look_up

ACETONE_PROPERTIES = {
    "PropertyTable": {"Properties": [{
        "CID": 180,
        "MolecularFormula": "C3H6O",
        "MolecularWeight": "58.08",
        "IUPACName": "propan-2-one",
    }]}
}

ACETONE_GHS = {
    "Record": {"Section": [{"TOCHeading": "Safety and Hazards", "Section": [
        {"TOCHeading": "Hazards Identification", "Section": [
            {"TOCHeading": "GHS Classification", "Information": [
                {"Name": "Signal", "Value": {"StringWithMarkup": [{"String": "Danger"}]}},
                {"Name": "GHS Hazard Statements", "Value": {"StringWithMarkup": [
                    {"String": "H225 (> 99.9%): Highly Flammable liquid and vapor "
                               "[Danger Flammable liquids]"},
                    {"String": "H319 (> 99.9%): Causes serious eye irritation "
                               "[Warning Serious eye damage/eye irritation]"},
                    {"String": "H336 (98.7%): May cause drowsiness or dizziness "
                               "[Warning Specific target organ toxicity, single exposure]"},
                ]}},
                {"Name": "Precautionary Statement Codes", "Value": {"StringWithMarkup": [
                    {"String": "P210, P233, P240, P261, P264+P265, P280, "
                               "P303+P361+P353, P405, and P501 (click each P-code)"},
                ]}},
            ]},
        ]},
    ]}]}
}

NO_GHS = {"Record": {"Section": []}}


@pytest.fixture(autouse=True)
def clear_cache():
    chemical_safety._cache.clear()
    yield
    chemical_safety._cache.clear()


def stub(monkeypatch, *, properties, ghs=None):
    def fake_get(path, attempt=0):
        if "/pug/compound/name/" in path:
            return properties
        return ghs
    monkeypatch.setattr(chemical_safety, "_get", fake_get)


def test_a_known_substance_comes_back_with_its_identifiers(monkeypatch):
    stub(monkeypatch, properties=ACETONE_PROPERTIES, ghs=ACETONE_GHS)
    result = look_up("acetone")
    assert result.matched
    assert result.cid == 180
    assert result.molecular_formula == "C3H6O"
    assert result.source_url == "https://pubchem.ncbi.nlm.nih.gov/compound/180"


def test_hazard_statements_are_quoted_with_their_codes_not_reworded(monkeypatch):
    # The code and the published wording, so they can be checked against a
    # label. The reporting percentage and the GHS category are stripped, since
    # neither is part of the statement.
    stub(monkeypatch, properties=ACETONE_PROPERTIES, ghs=ACETONE_GHS)
    result = look_up("acetone")
    codes = [hazard.code for hazard in result.hazard_statements]
    assert codes == ["H225", "H319", "H336"]
    assert result.hazard_statements[0].statement == "Highly Flammable liquid and vapor"
    assert result.signal_word == "Danger"


def test_precautionary_codes_are_split_out_of_the_published_sentence(monkeypatch):
    stub(monkeypatch, properties=ACETONE_PROPERTIES, ghs=ACETONE_GHS)
    result = look_up("acetone")
    assert "P210" in result.precautionary_codes
    assert "P303+P361+P353" in result.precautionary_codes
    # The trailing "(click each P-code)" is not a code.
    assert all(code.startswith("P") for code in result.precautionary_codes)


def test_every_answer_says_it_is_not_a_safety_data_sheet(monkeypatch):
    stub(monkeypatch, properties=ACETONE_PROPERTIES, ghs=ACETONE_GHS)
    result = look_up("acetone")
    assert any("not a safety data sheet" in note for note in result.notes)
    assert any("supplier" in note for note in result.notes)


def test_a_product_that_is_not_a_substance_is_not_guessed_at(monkeypatch):
    # "Cotton T-shirt" has no CID. Offering the hazards of something with a
    # similar name would be worse than saying nothing.
    stub(monkeypatch, properties=None)
    result = look_up("cotton t-shirt")
    assert not result.matched
    assert result.cid is None
    assert result.hazard_statements == ()
    assert any("not a substance" in note for note in result.notes)
    assert any("means the item is safe" in note for note in result.notes)


def test_no_published_classification_is_not_a_finding_of_no_hazard(monkeypatch):
    stub(monkeypatch, properties=ACETONE_PROPERTIES, ghs=NO_GHS)
    result = look_up("acetone")
    assert result.matched
    assert result.hazard_statements == ()
    assert any("not a finding that the substance is harmless" in note
               for note in result.notes)


def test_pubchem_being_busy_is_raised_not_reported_as_no_hazards(monkeypatch):
    def busy(path, attempt=0):
        raise ChemicalSafetyUnavailable(
            "PubChem is rate-limiting requests right now, so no safety data could be "
            "shown. This is not a finding that the substance is safe.")
    monkeypatch.setattr(chemical_safety, "_get", busy)
    with pytest.raises(ChemicalSafetyUnavailable, match="not a finding"):
        look_up("acetone")


def test_an_empty_query_asks_for_a_name_rather_than_calling_out(monkeypatch):
    def never(path, attempt=0):
        raise AssertionError("PubChem should not be called for an empty query")
    monkeypatch.setattr(chemical_safety, "_get", never)
    result = look_up("   ")
    assert not result.matched
    assert any("Give the name" in note for note in result.notes)


def test_a_repeated_lookup_does_not_call_pubchem_again(monkeypatch):
    calls = {"n": 0}

    def counted(path, attempt=0):
        calls["n"] += 1
        return ACETONE_PROPERTIES if "/pug/compound/name/" in path else ACETONE_GHS

    monkeypatch.setattr(chemical_safety, "_get", counted)
    look_up("Acetone")
    first = calls["n"]
    look_up("  acetone  ")          # same substance, different spacing and case
    assert calls["n"] == first
