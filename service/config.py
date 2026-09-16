"""Runtime settings, read from the environment and an optional service/.env."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .models import DEFAULT_MODEL, ModelProfile, get_profile

SERVICE_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVICE_DIR.parent

ALLOWED_EFFORTS = ("low", "medium", "high", "xhigh", "max")
MIN_THINKING_BUDGET = 1024


def load_env_file(path: Path = SERVICE_DIR / ".env") -> None:
    """Minimal KEY=VALUE loader. Never overrides a variable already set, so a
    real environment always wins over the file."""
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


def ai_credentials_present() -> bool:
    """True when the Anthropic SDK has something to authenticate with.

    The SDK resolves an API key, an auth token, or an `ant auth login` profile.
    This checks for the same sources without ever reading a secret's value.
    """
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
    profile: ModelProfile
    effort: str
    thinking_budget: int          # Haiku only; 0 = thinking off
    max_tokens: int
    cors_origins: tuple[str, ...]
    reporting_year: int
    cache_ttl_seconds: int        # 0 = cache off
    cache_path: Path
    rate_limit_per_hour: int      # 0 = unlimited

    @property
    def model(self) -> str:
        return self.profile.model

    @staticmethod
    def from_env() -> "Settings":
        profile = get_profile(os.environ.get("PCF_AI_MODEL", DEFAULT_MODEL).strip())

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
            profile=profile,
            effort=effort,
            thinking_budget=thinking_budget,
            max_tokens=max_tokens,
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
            reporting_year=_int("PCF_REPORTING_YEAR", date.today().year),
            cache_ttl_seconds=_int("PCF_CACHE_TTL_DAYS", 30) * 86400,
            cache_path=Path(os.environ.get("PCF_CACHE_PATH",
                                           str(SERVICE_DIR / "data" / "estimate_cache.db"))),
            rate_limit_per_hour=_int("PCF_RATE_LIMIT_PER_HOUR", 30),
        )
