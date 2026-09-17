"""Supported AI models, the request features each accepts, and their prices.

Two providers are supported. Within Anthropic, model families differ in what a
request may carry, and sending an unsupported field is a 400, not a no-op:

  - Claude Opus 5      adaptive thinking, effort, server-side refusal fallback
  - Claude Sonnet 5    adaptive thinking, effort
  - Claude Haiku 4.5   thinking only as an explicit token budget; no effort
  - Gemini 3.6 Flash   Google free tier; structured JSON via responseJsonSchema

Anthropic prices are USD per million tokens, from Anthropic's published
first-party rates as of 2026-06, used only to ESTIMATE spend; the invoice is
the source of truth. Gemini is marked `free_tier`: Google does not charge
within its free limits for a project WITHOUT billing linked. If billing is
linked to the key's project, Google charges its paid rates, which this service
does not track.

gemini-2.5-flash was the documented free model, but on 2026-09-17 the API
refused it for new users and named gemini-3.6-flash as the replacement.
The free tier allows gemini-3.6-flash only 20 requests a day per project, so
the other Gemini models above can be chained after it (see config.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

CACHE_WRITE_MULTIPLIER = Decimal("1.25")   # Anthropic 5-minute prompt cache write
CACHE_READ_MULTIPLIER = Decimal("0.1")     # Anthropic prompt cache hit

Provider = Literal["anthropic", "gemini"]
PROVIDERS: tuple[str, ...] = ("anthropic", "gemini")


@dataclass(frozen=True)
class ModelProfile:
    model: str
    label: str
    provider: Provider
    input_usd_per_mtok: Decimal
    output_usd_per_mtok: Decimal
    thinking: Literal["adaptive", "budget", "provider_default"]
    supports_effort: bool
    supports_server_fallback: bool
    billing: Literal["estimated", "free_tier"] = "estimated"


PROFILES: dict[str, ModelProfile] = {
    p.model: p for p in (
        ModelProfile("claude-haiku-4-5", "Claude Haiku 4.5", "anthropic", Decimal("1"), Decimal("5"),
                     thinking="budget", supports_effort=False, supports_server_fallback=False),
        ModelProfile("claude-sonnet-5", "Claude Sonnet 5", "anthropic", Decimal("2"), Decimal("10"),
                     thinking="adaptive", supports_effort=True, supports_server_fallback=False),
        ModelProfile("claude-opus-5", "Claude Opus 5", "anthropic", Decimal("5"), Decimal("25"),
                     thinking="adaptive", supports_effort=True, supports_server_fallback=True),
    ) + tuple(
        # Each Gemini model has its own free-tier daily quota, so listing several in
        # PCF_AI_PROVIDER multiplies the free estimates per day.
        ModelProfile(model, label, "gemini", Decimal("0"), Decimal("0"),
                     thinking="provider_default", supports_effort=False,
                     supports_server_fallback=False, billing="free_tier")
        for model, label in (
            ("gemini-3.8-flash", "Gemini 3.8 Flash"),
            ("gemini-3.6-flash", "Gemini 3.6 Flash"),
            ("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite"),
            ("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite"),
        )
    )
}

DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-haiku-4-5",
    "gemini": "gemini-3.6-flash",
}
DEFAULT_PROVIDER = "anthropic"
DEFAULT_MODEL = DEFAULT_MODELS[DEFAULT_PROVIDER]


def get_profile(model: str, provider: str | None = None) -> ModelProfile:
    if provider is not None and provider not in PROVIDERS:
        raise ValueError(f"PCF_AI_PROVIDER={provider!r} is not supported. "
                         f"Choose one of: {', '.join(PROVIDERS)}.")
    try:
        profile = PROFILES[model]
    except KeyError:
        options = [m for m, p in PROFILES.items() if provider in (None, p.provider)]
        raise ValueError(
            f"PCF_AI_MODEL={model!r} is not supported. Choose one of: "
            f"{', '.join(options)}.") from None
    if provider is not None and profile.provider != provider:
        raise ValueError(f"PCF_AI_MODEL={model!r} is a {profile.provider} model, but "
                         f"PCF_AI_PROVIDER is {provider!r}.")
    return profile


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

    @staticmethod
    def from_gemini(meta: dict | None) -> "TokenUsage":
        """Gemini's promptTokenCount INCLUDES cached tokens; ours does not."""
        meta = meta or {}
        get = lambda name: int(meta.get(name) or 0)  # noqa: E731
        cached = get("cachedContentTokenCount")
        return TokenUsage(input_tokens=max(get("promptTokenCount") - cached, 0),
                          output_tokens=get("candidatesTokenCount") + get("thoughtsTokenCount"),
                          cache_read_input_tokens=cached)


def estimate_cost_usd(profile: ModelProfile, usage: TokenUsage) -> Decimal:
    """Estimated spend for one request, in USD. Decimal throughout.

    A free-tier profile returns 0: nothing is charged within Google's limits.
    """
    if profile.billing == "free_tier":
        return Decimal(0)
    per_token_in = profile.input_usd_per_mtok / Decimal(1_000_000)
    per_token_out = profile.output_usd_per_mtok / Decimal(1_000_000)
    return (usage.input_tokens * per_token_in
            + usage.cache_creation_input_tokens * per_token_in * CACHE_WRITE_MULTIPLIER
            + usage.cache_read_input_tokens * per_token_in * CACHE_READ_MULTIPLIER
            + usage.output_tokens * per_token_out)
