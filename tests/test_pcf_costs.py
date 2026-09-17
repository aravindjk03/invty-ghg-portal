"""Cost controls for the Product Carbon service: model profiles, the spend
estimate, the decomposition cache and the per-client rate limit."""
from decimal import Decimal

import pytest

pytest.importorskip("pydantic")

from service.cache import DecompositionCache, cache_key
from service.config import Settings
from service.models import PROFILES, TokenUsage, estimate_cost_usd, get_profile
from service.ratelimit import SlidingWindowLimiter
from service.schemas import Decomposition, EstimateRequest


# --- model profiles and cost -------------------------------------------------

def test_unknown_model_is_rejected_with_the_supported_list():
    with pytest.raises(ValueError, match="claude-haiku-4-5"):
        get_profile("gpt-something")


def test_haiku_is_the_cheapest_paid_model():
    paid = [p for p in PROFILES.values() if p.billing == "estimated"]
    cheapest = min(paid, key=lambda p: (p.input_usd_per_mtok, p.output_usd_per_mtok))
    assert cheapest.model == "claude-haiku-4-5"


def test_cost_counts_input_output_and_cache_at_their_own_rates():
    haiku = get_profile("claude-haiku-4-5")        # $1 in, $5 out per million
    usage = TokenUsage(input_tokens=1_000_000, output_tokens=1_000_000,
                       cache_read_input_tokens=1_000_000, cache_creation_input_tokens=1_000_000)
    # 1 (input) + 5 (output) + 0.1 (cache read) + 1.25 (cache write)
    assert estimate_cost_usd(haiku, usage) == Decimal("7.35")


def test_a_typical_cached_haiku_estimate_costs_about_two_cents():
    """Guards the figure quoted to the product owner when choosing the model."""
    usage = TokenUsage(input_tokens=700, output_tokens=2500, cache_read_input_tokens=5800)
    cost = estimate_cost_usd(get_profile("claude-haiku-4-5"), usage)
    assert Decimal("0.01") < cost < Decimal("0.03")


def test_zero_usage_costs_nothing():
    assert estimate_cost_usd(get_profile("claude-opus-5"), TokenUsage()) == 0


# --- settings ----------------------------------------------------------------

def test_thinking_budget_below_the_api_minimum_is_rejected(monkeypatch):
    monkeypatch.setenv("PCF_AI_THINKING_BUDGET", "500")
    with pytest.raises(ValueError, match="PCF_AI_THINKING_BUDGET"):
        Settings.from_env()


def test_thinking_budget_must_leave_room_for_the_answer(monkeypatch):
    monkeypatch.setenv("PCF_AI_MAX_TOKENS", "4000")
    monkeypatch.setenv("PCF_AI_THINKING_BUDGET", "4000")
    with pytest.raises(ValueError, match="PCF_AI_THINKING_BUDGET"):
        Settings.from_env()


def test_non_numeric_limit_is_rejected_clearly(monkeypatch):
    monkeypatch.setenv("PCF_RATE_LIMIT_PER_HOUR", "lots")
    with pytest.raises(ValueError, match="whole number"):
        Settings.from_env()


# --- cache -------------------------------------------------------------------

def _decomp():
    return Decomposition.model_validate({
        "product": {"is_product": True, "interpreted_as": "x", "category": "other", "declared_unit": "1 item",
                    "is_ambiguous": False, "clarification": ""},
        "assumptions": {"region": "IN", "service_life_years": "1", "use_profile": "",
                        "end_of_life_route": ""},
        "lines": [{"stage": "raw_materials", "component": "a", "quantity": "1.10",
                   "quantity_unit": "kg", "factor_low": "0.1", "factor_central": "0.2",
                   "factor_high": "0.3", "factor_basis": "", "reference": "",
                   "catalogue_key": "", "production_route": ""}],
        "analysis": {"summary": "", "creation_drivers": [], "use_phase_drivers": [],
                     "reduction_opportunities": [], "data_gaps": [], "confidence": "low"},
    })


def test_cache_key_ignores_case_and_spacing():
    a = EstimateRequest(product="Electric Kettle", region="IN", details="5 year life")
    b = EstimateRequest(product="  electric   kettle ", region="IN", details="5  YEAR life")
    assert cache_key("m", "fp", a) == cache_key("m", "fp", b)


@pytest.mark.parametrize("change", [
    {"model": "other-model"},
    {"fingerprint": "new-prompt"},
    {"request": EstimateRequest(product="electric kettle", region="EU")},
    {"request": EstimateRequest(product="electric kettle", region="IN", details="10 years")},
])
def test_anything_that_could_change_the_answer_changes_the_key(change):
    base = dict(model="m", fingerprint="fp",
                request=EstimateRequest(product="electric kettle", region="IN"))
    changed = {**base, **change}
    assert cache_key(base["model"], base["fingerprint"], base["request"]) != \
        cache_key(changed["model"], changed["fingerprint"], changed["request"])


def test_cache_round_trips_exact_decimals(tmp_path):
    c = DecompositionCache(tmp_path / "c.db", ttl_seconds=3600)
    c.put("k", "m", _decomp())
    got = c.get("k")
    assert got == _decomp()
    assert str(got.lines[0].quantity) == "1.10"


def test_cache_entries_expire(tmp_path):
    now = [1000.0]
    c = DecompositionCache(tmp_path / "c.db", ttl_seconds=60, clock=lambda: now[0])
    c.put("k", "m", _decomp())
    now[0] += 61
    assert c.get("k") is None


def test_cache_can_be_disabled(tmp_path):
    c = DecompositionCache(tmp_path / "c.db", ttl_seconds=0)
    c.put("k", "m", _decomp())
    assert c.get("k") is None
    assert not (tmp_path / "c.db").exists()


# --- rate limit --------------------------------------------------------------

def test_limiter_allows_up_to_the_limit_then_blocks():
    lim = SlidingWindowLimiter(2, window_seconds=3600, clock=lambda: 0.0)
    assert lim.check("a") == (True, 0)
    assert lim.check("a") == (True, 0)
    allowed, retry = lim.check("a")
    assert not allowed and retry == 3600


def test_limiter_window_slides():
    now = [0.0]
    lim = SlidingWindowLimiter(1, window_seconds=60, clock=lambda: now[0])
    assert lim.check("a")[0]
    now[0] = 30
    assert not lim.check("a")[0]
    now[0] = 60
    assert lim.check("a")[0]


def test_limiter_tracks_clients_separately():
    lim = SlidingWindowLimiter(1, clock=lambda: 0.0)
    assert lim.check("a")[0] and lim.check("b")[0]


def test_limit_of_zero_means_unlimited():
    lim = SlidingWindowLimiter(0, clock=lambda: 0.0)
    assert all(lim.check("a")[0] for _ in range(100))
