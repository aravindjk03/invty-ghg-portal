"""Provider fallback: Gemini first, Claude when Gemini cannot answer.
No network. EVERY NUMBER HERE IS AN INVENTED FIXTURE."""
import json
from decimal import Decimal
from types import SimpleNamespace

import pytest

pytest.importorskip("fastapi")

from service.catalogue import Catalogue
from service.config import Settings
from service.estimator import (EstimatorIncomplete, EstimatorInvalidOutput,
                               EstimatorNotConfigured, EstimatorQuotaExceeded,
                               EstimatorRefused, EstimatorResult, EstimatorUnavailable)
from service.fallback import FallbackEstimator, ProviderStep
from service.models import PROFILES, TokenUsage
from service.schemas import Decomposition, EstimateRequest

GEMINI = PROFILES["gemini-3.6-flash"]
HAIKU = PROFILES["claude-haiku-4-5"]


def decomposition():
    return Decomposition.model_validate(json.loads(json.dumps({
        "product": {"is_product": True, "interpreted_as": "Cotton T-shirt", "category": "textiles",
                    "declared_unit": "1 item", "is_ambiguous": False, "clarification": ""},
        "assumptions": {"region": "IN", "service_life_years": 3, "use_profile": "Washed weekly",
                        "end_of_life_route": "Landfill"},
        "lines": [{"stage": "raw_materials", "component": "Cotton fibre", "quantity": 0.2,
                   "quantity_unit": "kg", "factor_low": 2, "factor_central": 3, "factor_high": 5,
                   "factor_basis": "fixture", "reference": "", "catalogue_key": "",
                   "production_route": ""}],
        "analysis": {"summary": "Fixture.", "creation_drivers": [], "use_phase_drivers": [],
                     "reduction_opportunities": [], "data_gaps": [], "confidence": "low"},
    }), parse_float=Decimal))


class Fake:
    def __init__(self, outcome):
        self.outcome, self.calls = outcome, 0

    def decompose(self, request, catalogue):
        self.calls += 1
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return EstimatorResult(decomposition=decomposition(), usage=TokenUsage(output_tokens=10))


def step(profile, outcome, configured=True):
    fake = Fake(outcome)
    return ProviderStep(profile=profile, configured=lambda: configured, build=lambda: fake), fake


@pytest.fixture
def req():
    return EstimateRequest(product="cotton t-shirt", region="IN")


@pytest.fixture
def catalogue():
    return Catalogue.load()


# --- the chain ------------------------------------------------------------------

def test_primary_answers_when_it_can(req, catalogue):
    (g, gf), (c, cf) = step(GEMINI, "ok"), step(HAIKU, "ok")
    result = FallbackEstimator([g, c]).decompose(req, catalogue)
    assert result.profile is GEMINI and result.fallback_from == ()
    assert (gf.calls, cf.calls) == (1, 0)


@pytest.mark.parametrize("failure", [
    EstimatorQuotaExceeded("daily limit"), EstimatorUnavailable("503"),
    EstimatorIncomplete("cut off"), EstimatorInvalidOutput("bad json"),
    EstimatorNotConfigured("key rejected"),
])
def test_claude_answers_when_gemini_cannot(failure, req, catalogue):
    (g, _), (c, cf) = step(GEMINI, failure), step(HAIKU, "ok")
    result = FallbackEstimator([g, c]).decompose(req, catalogue)
    assert result.profile is HAIKU
    assert result.fallback_from == ("Gemini 3.6 Flash",)
    assert cf.calls == 1


def test_a_refusal_is_not_routed_to_another_model(req, catalogue):
    """Sending a declined request elsewhere to get it answered would work around
    the first model's judgement."""
    (g, _), (c, cf) = step(GEMINI, EstimatorRefused("declined")), step(HAIKU, "ok")
    with pytest.raises(EstimatorRefused):
        FallbackEstimator([g, c]).decompose(req, catalogue)
    assert cf.calls == 0


def test_a_provider_without_a_key_is_skipped_without_a_request(req, catalogue):
    (g, gf), (c, _) = step(GEMINI, "ok", configured=False), step(HAIKU, "ok")
    result = FallbackEstimator([g, c]).decompose(req, catalogue)
    assert result.profile is HAIKU
    assert gf.calls == 0
    assert result.fallback_from == ()        # skipped, not failed: nothing to report


def test_gemini_failure_with_no_claude_key_says_the_backup_needs_a_key(req, catalogue):
    (g, _), (c, cf) = step(GEMINI, EstimatorQuotaExceeded("Gemini limit reached.")), \
        step(HAIKU, "ok", configured=False)
    with pytest.raises(EstimatorQuotaExceeded) as e:
        FallbackEstimator([g, c]).decompose(req, catalogue)
    assert "Gemini limit reached." in e.value.message
    assert "Claude Haiku 4.5 is set up as a backup but has no API key" in e.value.message
    assert cf.calls == 0


def test_every_provider_out_of_quota_is_reported_as_quota(req, catalogue):
    (g, _), (c, _) = step(GEMINI, EstimatorQuotaExceeded("a")), step(HAIKU, EstimatorQuotaExceeded("b"))
    with pytest.raises(EstimatorQuotaExceeded, match="Every AI provider"):
        FallbackEstimator([g, c]).decompose(req, catalogue)


def test_mixed_failures_report_the_last_one(req, catalogue):
    (g, _), (c, _) = step(GEMINI, EstimatorQuotaExceeded("a")), step(HAIKU, EstimatorUnavailable("down"))
    with pytest.raises(EstimatorUnavailable, match="down"):
        FallbackEstimator([g, c]).decompose(req, catalogue)


def test_no_keys_at_all_is_not_configured(req, catalogue):
    (g, _), (c, _) = step(GEMINI, "ok", configured=False), step(HAIKU, "ok", configured=False)
    with pytest.raises(EstimatorNotConfigured):
        FallbackEstimator([g, c]).decompose(req, catalogue)


def test_estimators_are_built_once_and_reused(req, catalogue):
    builds = []
    fake = Fake("ok")
    s = ProviderStep(profile=GEMINI, configured=lambda: True,
                     build=lambda: builds.append(1) or fake)
    chain = FallbackEstimator([s])
    chain.decompose(req, catalogue)
    chain.decompose(req, catalogue)
    assert len(builds) == 1 and fake.calls == 2


def test_an_empty_chain_is_refused():
    with pytest.raises(ValueError):
        FallbackEstimator([])


# --- settings -------------------------------------------------------------------

def test_provider_list_is_parsed_in_order(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini, anthropic")
    s = Settings.from_env()
    assert [p.model for p in s.profiles] == ["gemini-3.6-flash", "claude-haiku-4-5"]
    assert s.profile is s.profiles[0]
    assert s.cache_identity == "gemini-3.6-flash>claude-haiku-4-5"


def test_single_provider_keeps_the_plain_cache_identity(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini")
    assert Settings.from_env().cache_identity == "gemini-3.6-flash"


def test_per_provider_model_override(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini,anthropic")
    monkeypatch.setenv("PCF_ANTHROPIC_MODEL", "claude-sonnet-5")
    assert Settings.from_env().profiles[1].model == "claude-sonnet-5"


def test_listing_a_provider_twice_is_rejected(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini,gemini")
    with pytest.raises(ValueError, match="twice"):
        Settings.from_env()


def test_mistral_is_not_a_supported_provider(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini,mistral")
    with pytest.raises(ValueError, match="PCF_AI_PROVIDER"):
        Settings.from_env()


# --- the HTTP layer -------------------------------------------------------------

@pytest.fixture
def app_chain(monkeypatch, tmp_path):
    from service import app as module
    from service.app import _Spend
    from service.cache import DecompositionCache
    from service.ratelimit import SlidingWindowLimiter
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini,anthropic")
    monkeypatch.setenv("PCF_ADMIN_TOKEN", "test-admin-token")
    monkeypatch.setattr(module, "settings", Settings.from_env())
    monkeypatch.setattr(module, "cache", DecompositionCache(tmp_path / "c.db", 3600))
    monkeypatch.setattr(module, "limiter", SlidingWindowLimiter(100))
    monkeypatch.setattr(module, "spend", _Spend())
    monkeypatch.setattr(module, "probe_anthropic", lambda model: "ready")
    monkeypatch.setattr(module, "_anthropic_status", {"checked": 0.0, "status": None})
    return module


def _http():
    return SimpleNamespace(client=SimpleNamespace(host="t"))


def test_admin_status_lists_both_providers_and_their_status(app_chain, monkeypatch):
    monkeypatch.setattr(app_chain, "ai_credentials_present", lambda provider: provider == "gemini")
    s = app_chain.admin_status(x_admin_token="test-admin-token")
    assert [(p["model"], p["status"]) for p in s["providers"]] == \
        [("gemini-3.6-flash", "ready"), ("claude-haiku-4-5", "needs_key")]
    assert app_chain.health()["ai_ready"] is True

def test_fallback_is_invisible_publicly_and_recorded_for_the_operator(app_chain, monkeypatch, req):
    monkeypatch.setattr(app_chain, "ai_credentials_present", lambda provider: True)
    g, _ = step(GEMINI, EstimatorQuotaExceeded("limit"))
    c, _ = step(HAIKU, "ok")
    monkeypatch.setattr(app_chain, "_estimator", FallbackEstimator([g, c]))
    r = app_chain.estimate(req, _http())
    assert r.method.assistant == "INSITY EDGE AI"
    usage = app_chain.admin_status(x_admin_token="test-admin-token")["usage_since_start"]
    assert usage["by_model"] == {"claude-haiku-4-5": 1} and usage["fallbacks"] == 1

def test_the_cache_records_the_model_that_produced_an_answer(app_chain, monkeypatch, req):
    from service.cache import cache_key
    monkeypatch.setattr(app_chain, "ai_credentials_present", lambda provider: True)
    g, _ = step(GEMINI, EstimatorUnavailable("down"))
    c, _ = step(HAIKU, "ok")
    monkeypatch.setattr(app_chain, "_estimator", FallbackEstimator([g, c]))
    app_chain.estimate(req, _http())
    key = cache_key(app_chain.settings.cache_identity, app_chain.fingerprint, req)
    assert app_chain.cache.lookup(key)[1] == "claude-haiku-4-5"
    assert app_chain.estimate(req, _http()).method.cache_hit is True

def test_not_configured_message_is_brand_level(app_chain, monkeypatch, req):
    from fastapi import HTTPException
    monkeypatch.setattr(app_chain, "ai_credentials_present", lambda provider: False)
    with pytest.raises(HTTPException) as e:
        app_chain.estimate(req, _http())
    message = e.value.detail["message"]
    assert message.startswith("INSITY EDGE AI")
    assert "API_KEY" not in message and "Gemini" not in message and "Claude" not in message



# --- several Gemini models, parking -----------------------------------------------

def test_the_chain_can_list_several_models_of_one_provider(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER",
                       "gemini:gemini-3.8-flash, gemini:gemini-3.6-flash, gemini:gemini-3.1-flash-lite, anthropic")
    s = Settings.from_env()
    assert [(p.provider, p.model) for p in s.profiles] == [
        ("gemini", "gemini-3.8-flash"), ("gemini", "gemini-3.6-flash"),
        ("gemini", "gemini-3.1-flash-lite"), ("anthropic", "claude-haiku-4-5")]
    assert all(p.billing == "free_tier" for p in s.profiles[:3])


def test_the_same_model_twice_is_rejected(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini:gemini-3.6-flash,gemini")
    with pytest.raises(ValueError, match="twice"):
        Settings.from_env()


def test_a_model_from_another_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("PCF_AI_PROVIDER", "gemini:claude-haiku-4-5")
    with pytest.raises(ValueError, match="anthropic model"):
        Settings.from_env()


def test_the_next_gemini_model_answers_when_the_first_is_out_of_quota(req, catalogue):
    g2 = PROFILES["gemini-3.1-flash-lite"]
    (a, af), (b, bf) = step(GEMINI, EstimatorQuotaExceeded("limit")), step(g2, "ok")
    result = FallbackEstimator([a, b]).decompose(req, catalogue)
    assert result.profile is g2 and (af.calls, bf.calls) == (1, 1)


def test_an_out_of_quota_provider_is_parked_then_retried(req, catalogue):
    now = [0.0]
    (g, gf), (c, cf) = step(GEMINI, EstimatorQuotaExceeded("limit")), step(HAIKU, "ok")
    chain = FallbackEstimator([g, c], park_seconds=600, clock=lambda: now[0])
    chain.decompose(req, catalogue)
    chain.decompose(req, catalogue)
    assert (gf.calls, cf.calls) == (1, 2)          # second estimate skipped Gemini
    now[0] = 601
    chain.decompose(req, catalogue)
    assert gf.calls == 2                            # tried again after the park


def test_a_backup_without_credit_is_parked_too(req, catalogue):
    (g, gf), (c, cf) = step(GEMINI, EstimatorQuotaExceeded("limit")), \
        step(HAIKU, EstimatorNotConfigured("no credit"))
    chain = FallbackEstimator([g, c], clock=lambda: 0.0)
    for _ in range(3):
        with pytest.raises(EstimatorQuotaExceeded):
            chain.decompose(req, catalogue)
    assert (gf.calls, cf.calls) == (1, 1)


def test_quota_spent_and_backup_without_credit_is_reported_as_quota(req, catalogue):
    (g, _), (c, _) = step(GEMINI, EstimatorQuotaExceeded("Gemini limit.")), \
        step(HAIKU, EstimatorNotConfigured("No credit."))
    with pytest.raises(EstimatorQuotaExceeded) as e:
        FallbackEstimator([g, c]).decompose(req, catalogue)
    assert "Gemini limit." in e.value.message and "No credit." in e.value.message
