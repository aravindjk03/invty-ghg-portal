"""Supported Claude models, the request features each accepts, and their prices.

Model families differ in what a request may carry, and sending an unsupported
field is a 400, not a silent no-op:

  - Claude Opus 5      adaptive thinking, effort, server-side refusal fallback
  - Claude Sonnet 5    adaptive thinking, effort
  - Claude Haiku 4.5   thinking only as an explicit token budget; no effort

Prices are USD per million tokens, from Anthropic's published first-party rates
as of 2026-06. They are used only to ESTIMATE spend shown to the operator; the
invoice is the source of truth. Update PROFILES when rates change.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

CACHE_WRITE_MULTIPLIER = Decimal("1.25")   # 5-minute prompt cache write
CACHE_READ_MULTIPLIER = Decimal("0.1")     # prompt cache hit


@dataclass(frozen=True)
class ModelProfile:
    model: str
    label: str
    input_usd_per_mtok: Decimal
    output_usd_per_mtok: Decimal
    thinking: Literal["adaptive", "budget"]
    supports_effort: bool
    supports_server_fallback: bool


PROFILES: dict[str, ModelProfile] = {
    p.model: p for p in (
        ModelProfile("claude-haiku-4-5", "Claude Haiku 4.5", Decimal("1"), Decimal("5"),
                     thinking="budget", supports_effort=False, supports_server_fallback=False),
        ModelProfile("claude-sonnet-5", "Claude Sonnet 5", Decimal("2"), Decimal("10"),
                     thinking="adaptive", supports_effort=True, supports_server_fallback=False),
        ModelProfile("claude-opus-5", "Claude Opus 5", Decimal("5"), Decimal("25"),
                     thinking="adaptive", supports_effort=True, supports_server_fallback=True),
    )
}

DEFAULT_MODEL = "claude-haiku-4-5"


def get_profile(model: str) -> ModelProfile:
    try:
        return PROFILES[model]
    except KeyError:
        raise ValueError(
            f"PCF_AI_MODEL={model!r} is not supported. Choose one of: "
            f"{', '.join(PROFILES)}.") from None


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int = 0                  # uncached input
    output_tokens: int = 0                 # includes any thinking tokens
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    @staticmethod
    def from_sdk(usage) -> "TokenUsage":
        get = lambda name: int(getattr(usage, name, 0) or 0)  # noqa: E731
        return TokenUsage(get("input_tokens"), get("output_tokens"),
                          get("cache_read_input_tokens"), get("cache_creation_input_tokens"))


def estimate_cost_usd(profile: ModelProfile, usage: TokenUsage) -> Decimal:
    """Estimated spend for one request, in USD. Decimal throughout."""
    per_token_in = profile.input_usd_per_mtok / Decimal(1_000_000)
    per_token_out = profile.output_usd_per_mtok / Decimal(1_000_000)
    return (usage.input_tokens * per_token_in
            + usage.cache_creation_input_tokens * per_token_in * CACHE_WRITE_MULTIPLIER
            + usage.cache_read_input_tokens * per_token_in * CACHE_READ_MULTIPLIER
            + usage.output_tokens * per_token_out)
