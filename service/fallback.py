"""Try AI providers in order until one answers.

Configured as PCF_AI_PROVIDER=gemini,anthropic: Gemini's free tier answers
first, and Claude answers only when Gemini cannot - its daily quota is spent,
Google is down, or it returned something unusable.

What moves on to the next provider:
  - quota exhausted, service unavailable, truncated or malformed output
  - a provider with no API key (skipped without a request)

A provider that reports its quota is spent, or an account that cannot be used
(e.g. no credit), is parked for PARK_SECONDS: later estimates skip it instead
of spending a round trip on a request that will fail the same way.
Several models from one provider can be chained (gemini:gemini-3.8-flash,...):
each Gemini model has its own free daily quota.

What does NOT move on:
  - a refusal. Routing a declined request to a different model to get it
    answered anyway would be working around that model's judgement.

Every provider's output goes through the same schema validation and the same
ghg_core arithmetic, so a fallback changes who proposed the lines, never how
the totals are computed. The response names the model that answered and any
provider that failed first.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field, replace
from typing import Callable, Optional

from .catalogue import Catalogue
from .estimator import (AIEstimator, EstimatorError, EstimatorIncomplete,
                        EstimatorInvalidOutput, EstimatorNotConfigured,
                        EstimatorQuotaExceeded, EstimatorRefused, EstimatorResult,
                        EstimatorUnavailable)
from .guard import sanitize_decomposition
from .models import ModelProfile
from .schemas import EstimateRequest

log = logging.getLogger("invty.pcf")

FALL_THROUGH = (EstimatorQuotaExceeded, EstimatorUnavailable, EstimatorIncomplete,
                EstimatorInvalidOutput, EstimatorNotConfigured)

# A free-tier 429 usually means the DAILY quota is spent. Google's "retry in 45s"
# hint is not reliable for that, so a quota failure parks the model for a while.
PARK_SECONDS = 600.0
PARKED_ON = (EstimatorQuotaExceeded, EstimatorNotConfigured)


@dataclass
class ProviderStep:
    profile: ModelProfile
    configured: Callable[[], bool]
    build: Callable[[], AIEstimator]
    _estimator: Optional[AIEstimator] = field(default=None, repr=False)
    _parked_until: float = field(default=0.0, repr=False)
    _parked_error: Optional[EstimatorError] = field(default=None, repr=False)

    def estimator(self) -> AIEstimator:
        if self._estimator is None:
            self._estimator = self.build()
        return self._estimator


class FallbackEstimator:
    def __init__(self, steps: list[ProviderStep], *,
                 park_seconds: float = PARK_SECONDS,
                 clock: Callable[[], float] = time.monotonic):
        if not steps:
            raise ValueError("At least one AI provider is required.")
        self.steps = list(steps)
        self.park_seconds, self._clock = park_seconds, clock

    def decompose(self, request: EstimateRequest, catalogue: Catalogue) -> EstimatorResult:
        failed: list[str] = []                       # tried and failed: shown to the user
        tried_errors: list[EstimatorError] = []
        unconfigured: list[str] = []                 # never tried: no key

        for step in self.steps:
            label = step.profile.label
            if not step.configured():
                unconfigured.append(label)
                continue
            if step._parked_error is not None and self._clock() < step._parked_until:
                failed.append(label)
                tried_errors.append(step._parked_error)
                continue
            try:
                result = step.estimator().decompose(request, catalogue)
                # Unsafe or absurd output counts as invalid, so the next provider
                # gets a chance rather than the page showing it.
                result = replace(result,
                                 decomposition=sanitize_decomposition(result.decomposition))
            except EstimatorRefused:
                raise
            except FALL_THROUGH as exc:
                log.warning("AI provider %s failed (%s); trying the next one",
                            step.profile.model, exc.code)
                if isinstance(exc, PARKED_ON):
                    step._parked_error = exc
                    step._parked_until = self._clock() + self.park_seconds
                failed.append(label)
                tried_errors.append(exc)
                continue
            return replace(result, profile=step.profile, fallback_from=tuple(failed))

        raise self._final_error(tried_errors, unconfigured)

    @staticmethod
    def _final_error(tried: list[EstimatorError], unconfigured: list[str]) -> EstimatorError:
        if not tried:
            return EstimatorNotConfigured(
                "No AI provider has an API key. Add one to service/.env and restart the "
                "Product Carbon service.")
        quota = [e for e in tried if isinstance(e, EstimatorQuotaExceeded)]
        if len(tried) > 1 and len(quota) == len(tried):
            error: EstimatorError = EstimatorQuotaExceeded(
                "Every AI provider has reached its limit. Try again later. Products "
                "already estimated still load.")
        elif quota and len(quota) < len(tried) and all(isinstance(e, (EstimatorQuotaExceeded, EstimatorNotConfigured))
                           for e in tried):
            # e.g. every free model is out of quota and the paid backup has no credit:
            # the limit is what the visitor should hear about, not the backup's billing.
            detail = " ".join(e.message for e in tried)
            error = EstimatorQuotaExceeded(f"Every usable AI provider has reached its limit. {detail}")
        else:
            error = tried[-1]
        if unconfigured:
            backup = " and ".join(unconfigured)
            error = type(error)(f"{error.message} {backup} is set up as a backup but has no "
                                f"API key yet.")
        return error
