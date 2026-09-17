"""Token economy of the Product Carbon prompts, and Anthropic account status.
No network: the Anthropic client and the account probe are faked."""
from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")

from ghg_core import InMemoryFactorRegistry
from ghg_core.factors import CRADLE_TO_GATE, PHYSICAL_BASIS
from service.catalogue import Catalogue
from service.estimator import (NO_CATALOGUE_SECTION, ClaudeEstimator, EstimatorError,
                               EstimatorNotConfigured, build_system, prompt_fingerprint)
from service.fallback import FallbackEstimator, ProviderStep
from service.models import PROFILES
from service.schemas import EstimateRequest
from conftest import ef

HAIKU = PROFILES["claude-haiku-4-5"]


@pytest.fixture
def catalogue():
    return Catalogue.load()


def _verified(key="pcf.chem.ammonia.smr", route="smr", superseded_by=None):
    return ef(version_id=f"v-{key}", activity_key=key, region="IN", reference_year=2026,
              gas="CO2", value="2", numerator_unit="kgCO2e", denominator_unit="kg",
              ef_basis=PHYSICAL_BASIS, production_route=route, system_boundary=CRADLE_TO_GATE,
              allocation_method="subdivision", superseded_by=superseded_by)


# --- which materials the prompt lists ---------------------------------------------

def test_registry_reports_only_current_activity_keys():
    reg = InMemoryFactorRegistry([_verified(), _verified("pcf.metal.steel.bf_bof", "bf_bof",
                                                         superseded_by="newer")])
    assert reg.activity_keys() == frozenset({"pcf.chem.ammonia.smr"})


def test_empty_registry_leaves_the_catalogue_out_of_the_prompt(catalogue):
    empty = catalogue.restricted_to(InMemoryFactorRegistry().activity_keys())
    system = build_system(empty)
    assert "pcf." not in system
    assert system.endswith(NO_CATALOGUE_SECTION)


def test_trimmed_prompt_is_a_fraction_of_the_full_one(catalogue):
    full = len(build_system(catalogue))
    trimmed = len(build_system(catalogue.restricted_to(())))
    assert trimmed < full * 0.3


def test_only_materials_with_verified_factors_are_listed(catalogue):
    reg = InMemoryFactorRegistry([_verified()])
    system = build_system(catalogue.restricted_to(reg.activity_keys()))
    assert "pcf.chem.ammonia.smr | route=smr" in system
    assert "pcf.metal.steel.bf_bof" not in system


def test_listing_verified_factors_changes_the_prompt_fingerprint(catalogue):
    """Cached answers produced without the listing must not be reused once it appears."""
    assert prompt_fingerprint(catalogue.restricted_to(())) != \
        prompt_fingerprint(catalogue.restricted_to({"pcf.chem.ammonia.smr"}))


def test_app_prompt_catalogue_matches_its_registry():
    from service import app as module
    assert module.prompt_catalogue.prompt_listing() == ""
    assert len(module.registry) == 0


def test_prompt_asks_for_a_short_answer(catalogue):
    system = build_system(catalogue.restricted_to(()))
    assert "usually 5 to 10" in system
    assert "summary at most three sentences" in system


# --- Anthropic account with no credit ----------------------------------------------

def _anthropic_400(message):
    import anthropic
    import httpx2
    response = httpx2.Response(400, request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    return anthropic.BadRequestError(message, response=response,
                                     body={"type": "error", "error": {"message": message}})


class _RaisingClient:
    def __init__(self, exc):
        def stream(**kwargs):
            raise exc
        self.messages = SimpleNamespace(stream=stream)
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=stream))


def _claude(exc):
    return ClaudeEstimator(HAIKU, effort="high", thinking_budget=0, max_tokens=4096,
                           client=_RaisingClient(exc))


def test_no_credit_is_reported_plainly_not_as_try_again(catalogue):
    est = _claude(_anthropic_400("Your credit balance is too low to access the Anthropic API."))
    with pytest.raises(EstimatorNotConfigured) as e:
        est.decompose(EstimateRequest(product="cotton t-shirt", region="IN"), catalogue)
    assert "no API credit" in e.value.message and "Plans & Billing" in e.value.message
    assert "Try again shortly" not in e.value.message


def test_other_bad_requests_are_not_called_temporary(catalogue):
    est = _claude(_anthropic_400("messages: field required"))
    with pytest.raises(EstimatorError) as e:
        est.decompose(EstimateRequest(product="cotton t-shirt", region="IN"), catalogue)
    assert type(e.value) is EstimatorError
    assert "rejected the request (400)" in e.value.message


def test_gemini_quota_plus_claude_without_credit_explains_both(catalogue):
    from service.estimator import EstimatorQuotaExceeded

    class Failing:
        def __init__(self, exc):
            self.exc = exc

        def decompose(self, request, catalogue):
            raise self.exc

    chain = FallbackEstimator([
        ProviderStep(PROFILES["gemini-3.6-flash"], configured=lambda: True,
                     build=lambda: Failing(EstimatorQuotaExceeded("Gemini limit reached."))),
        ProviderStep(HAIKU, configured=lambda: True,
                     build=lambda: Failing(EstimatorNotConfigured(
                         "The Anthropic account has no API credit."))),
    ])
    with pytest.raises(EstimatorNotConfigured, match="no API credit"):
        chain.decompose(EstimateRequest(product="cotton t-shirt", region="IN"), catalogue)


# --- provider status on /health ------------------------------------------------------

@pytest.fixture
def app_status(monkeypatch):
    from service import app as module
    from service.config import Settings
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini,anthropic")
    monkeypatch.setattr(module, "settings", Settings.from_env())
    monkeypatch.setattr(module, "_anthropic_status", {"checked": 0.0, "status": None})
    return module


def test_status_says_which_provider_needs_a_key(app_status, monkeypatch):
    monkeypatch.setattr(app_status, "ai_credentials_present", lambda provider: provider == "gemini")
    monkeypatch.setattr(app_status, "probe_anthropic", lambda model: pytest.fail("no key: must not probe"))
    statuses = [p["status"] for p in app_status.health()["providers"]]
    assert statuses == ["ready", "needs_key"]


def test_status_reports_an_anthropic_account_without_credit(app_status, monkeypatch):
    monkeypatch.setattr(app_status, "ai_credentials_present", lambda provider: True)
    monkeypatch.setattr(app_status, "probe_anthropic", lambda model: "no_credit")
    assert app_status.health()["providers"][1]["status"] == "no_credit"


def test_account_probe_is_cached(app_status, monkeypatch):
    calls = []
    monkeypatch.setattr(app_status, "ai_credentials_present", lambda provider: True)
    monkeypatch.setattr(app_status, "probe_anthropic", lambda model: calls.append(model) or "ready")
    app_status.health()
    app_status.health()
    assert calls == ["claude-haiku-4-5"]
