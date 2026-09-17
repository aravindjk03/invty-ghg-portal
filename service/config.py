"""Runtime settings, read from the environment and an optional service/.env."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .models import DEFAULT_MODELS, DEFAULT_PROVIDER, ModelProfile, get_profile

SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVICE_DIR.parent

ALLOWED_EFFORTS = ("low", "medium", "high", "xhigh", "max")
MIN_THINKING_BUDGET = 1024


def load_env_file(path: Path | None = None) -> None:
    """Minimal KEY=VALUE loader. Never overrides a variable already set, so a
    real environment always wins over the file.

    PCF_ENV_FILE overrides the location; set it to an empty string to load no
    file at all. The test suite does that so it never reads local secrets.
    """
    if path is None:
        override = os.environ.get("PCF_ENV_FILE")
        if override == "":
            return
        path = Path(override) if override else SERVICE_DIR / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split(" #", 1)[0]          # allow trailing comments
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


def gemini_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def ai_credentials_present(provider: str = "anthropic") -> bool:
    """True when the selected provider has something to authenticate with.

    Anthropic: an API key, an auth token, or an `ant auth login` profile.
    Gemini: GEMINI_API_KEY (or GOOGLE_API_KEY).
    Never reads a secret's value beyond checking it is non-empty.
    """
    if provider == "gemini":
        return bool(gemini_api_key())
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True
    if os.environ.get("ANTHROPIC_PROFILE"):
        return True
    return (Path.home() / ".config" / "anthropic").is_dir()


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        raise ValueError(f"{name} must be a whole number, got {raw!r}") from None


@dataclass(frozen=True)
class Settings:
    profiles: tuple[ModelProfile, ...]   # in the order they are tried
    effort: str
    thinking_budget: int          # Haiku only; 0 = thinking off
    max_tokens: int
    cors_origins: tuple[str, ...]
    reporting_year: int
    cache_ttl_seconds: int        # 0 = cache off
    cache_path: Path
    rate_limit_per_hour: int      # 0 = unlimited
    assistant_name: str           # the only AI name the public ever sees
    admin_token: str              # guards /admin/status; empty disables it

    @property
    def profile(self) -> ModelProfile:
        """The primary provider: tried first."""
        return self.profiles[0]

    @property
    def model(self) -> str:
        return self.profile.model

    @property
    def provider(self) -> str:
        return self.profile.provider

    @property
    def cache_identity(self) -> str:
        """The provider chain, for cache keys. A single provider keeps the plain
        model name, so existing cached answers stay valid."""
        return ">".join(p.model for p in self.profiles)

    @staticmethod
    def from_env() -> "Settings":
        providers = [p.strip().lower() for p in
                     os.environ.get("PCF_AI_PROVIDER", DEFAULT_PROVIDER).split(",") if p.strip()]
        if not providers:
            raise ValueError("PCF_AI_PROVIDER is empty. Set it to e.g. gemini or gemini,anthropic.")
        if len(set(providers)) != len(providers):
            raise ValueError(f"PCF_AI_PROVIDER lists a provider twice: {','.join(providers)}")
        profiles = []
        for provider in providers:
            default_model = DEFAULT_MODELS.get(provider, "")
            # PCF_<PROVIDER>_MODEL picks one provider's model. PCF_AI_MODEL still works
            # when only one provider is configured.
            model = os.environ.get(f"PCF_{provider.upper()}_MODEL", "").strip()
            if not model and len(providers) == 1:
                model = os.environ.get("PCF_AI_MODEL", "").strip()
            profiles.append(get_profile(model or default_model, provider))

        effort = os.environ.get("PCF_AI_EFFORT", "high").strip().lower()
        if effort not in ALLOWED_EFFORTS:
            raise ValueError(f"PCF_AI_EFFORT must be one of {ALLOWED_EFFORTS}, got {effort!r}")

        max_tokens = _int("PCF_AI_MAX_TOKENS", 16000)
        thinking_budget = _int("PCF_AI_THINKING_BUDGET", 0)
        if thinking_budget and not (MIN_THINKING_BUDGET <= thinking_budget < max_tokens):
            raise ValueError(
                f"PCF_AI_THINKING_BUDGET must be 0 (off) or between {MIN_THINKING_BUDGET} "
                f"and PCF_AI_MAX_TOKENS ({max_tokens}), got {thinking_budget}")

        origins = os.environ.get("PCF_CORS_ORIGINS", "http://localhost:5173")
        return Settings(
            profiles=tuple(profiles),
            effort=effort,
            thinking_budget=thinking_budget,
            max_tokens=max_tokens,
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
            reporting_year=_int("PCF_REPORTING_YEAR", date.today().year),
            cache_ttl_seconds=_int("PCF_CACHE_TTL_DAYS", 30) * 86400,
            cache_path=Path(os.environ.get("PCF_CACHE_PATH",
                                           str(SERVICE_DIR / "data" / "estimate_cache.db"))),
            rate_limit_per_hour=_int("PCF_RATE_LIMIT_PER_HOUR", 30),
            assistant_name=os.environ.get("PCF_ASSISTANT_NAME", "INSITY EDGE AI").strip()
            or "INSITY EDGE AI",
            admin_token=os.environ.get("PCF_ADMIN_TOKEN", "").strip(),
        )
