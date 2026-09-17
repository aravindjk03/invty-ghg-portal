"""Gemini as the AI half, over the REST generateContent endpoint.

Uses the standard library's HTTP client, so the free Gemini option adds no
dependency. The request carries the same system prompt and the same output
schema as the Claude path, and the result goes through the same Decomposition
validation and ghg_core arithmetic - the model never produces an aggregate.

Request and response field names follow
https://ai.google.dev/api/generate-content and were verified against the live
API on 2026-09-17 (responseJsonSchema honoured additionalProperties, required
and enum).

The API key travels in the x-goog-api-key header, never in the URL, and is
never included in an error message or log line.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Callable

from pydantic import ValidationError

from .catalogue import Catalogue
from .estimator import (EstimatorError, EstimatorIncomplete, EstimatorInvalidOutput,
                        EstimatorNotConfigured, EstimatorQuotaExceeded, EstimatorRefused,
                        EstimatorResult, EstimatorUnavailable, build_system,
                        build_user_message)
from .models import ModelProfile, TokenUsage
from .schemas import DECOMPOSITION_SCHEMA, Decomposition, EstimateRequest

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# finishReason values that mean the model stopped for a policy reason.
REFUSAL_FINISH_REASONS = frozenset({
    "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII",
    "IMAGE_SAFETY", "LANGUAGE",
})

# Transient server-side failures worth retrying. 429 is NOT retried: on the
# free tier it usually means the daily quota is spent, and retrying burns time.
RETRYABLE_STATUS = frozenset({500, 502, 503, 504})

# (url, headers, body, timeout_seconds) -> (http_status, response_bytes)
Transport = Callable[[str, dict, bytes, float], tuple[int, bytes]]


def urllib_transport(url: str, headers: dict, body: bytes, timeout: float) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:          # 4xx / 5xx still carry a JSON body
        return exc.code, exc.read()


def build_body(system: str, user: str, max_tokens: int) -> dict:
    return {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "responseMimeType": "application/json",
            "responseJsonSchema": DECOMPOSITION_SCHEMA,
        },
    }


def parse_response(data: dict) -> Decomposition:
    """Validate a generateContent response into a Decomposition.

    Checks for a blocked prompt and the finish reason BEFORE reading text, and
    skips thought parts so reasoning is never parsed as the answer.
    """
    if (data.get("promptFeedback") or {}).get("blockReason"):
        raise EstimatorRefused(
            "The AI declined to analyse this product. Try describing it differently.")

    candidates = data.get("candidates") or []
    if not candidates:
        raise EstimatorInvalidOutput("The AI returned no analysis.")
    candidate = candidates[0]

    finish = candidate.get("finishReason")
    if finish == "MAX_TOKENS":
        raise EstimatorIncomplete(
            "The analysis ran out of room before finishing. Try a more specific product.")
    if finish in REFUSAL_FINISH_REASONS:
        raise EstimatorRefused(
            "The AI declined to analyse this product. Try describing it differently.")

    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not text.strip():
        raise EstimatorInvalidOutput("The AI returned no analysis.")

    try:
        return Decomposition.model_validate(json.loads(text, parse_float=Decimal))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise EstimatorInvalidOutput(
            "The AI returned an analysis that did not match the expected structure.") from exc


def error_for_status(status: int, data: dict, model: str) -> EstimatorError:
    """Map a non-200 response to an error the page can explain. The API key is
    never echoed: Google's messages do not contain it, and none is added here."""
    error = data.get("error") or {}
    raw = json.dumps(error)
    if status == 400 and ("API_KEY_INVALID" in raw or "API key not valid" in raw):
        return EstimatorNotConfigured(
            "Google rejected the Gemini API key. Check GEMINI_API_KEY in service/.env.")
    if status in (401, 403):
        return EstimatorNotConfigured(
            f"The Gemini API key does not have access to {model}.")
    if status == 404:
        return EstimatorUnavailable(
            f"Google no longer offers {model} to this account. Set PCF_AI_MODEL to a "
            f"current Gemini model in service/.env.")
    if status == 429:
        return EstimatorQuotaExceeded(
            "The Gemini free-tier limit for this key has been reached. It resets over "
            "time; try again later. Products already estimated still load.")
    if status >= 500:
        return EstimatorUnavailable(
            f"Google's Gemini service returned an error ({status}). Try again shortly.")
    return EstimatorError(f"The Gemini service rejected the request ({status}).")


class GeminiEstimator:
    def __init__(self, profile: ModelProfile, *, api_key: str, max_tokens: int,
                 transport: Transport = urllib_transport, timeout: float = 180.0,
                 max_retries: int = 2, backoff_seconds: float = 2.0,
                 sleep: Callable[[float], None] = time.sleep):
        if not api_key:
            raise EstimatorNotConfigured(
                "Gemini is selected but GEMINI_API_KEY is empty in service/.env.")
        self.profile, self.max_tokens, self.timeout = profile, max_tokens, timeout
        self._api_key = api_key
        self._transport = transport
        self.max_retries, self.backoff_seconds, self._sleep = max_retries, backoff_seconds, sleep

    def __repr__(self) -> str:                       # keep the key out of any repr
        return f"GeminiEstimator(model={self.profile.model!r})"

    def decompose(self, request: EstimateRequest, catalogue: Catalogue) -> EstimatorResult:
        url = ENDPOINT.format(model=self.profile.model)
        body = json.dumps(build_body(build_system(catalogue), build_user_message(request),
                                     self.max_tokens)).encode("utf-8")
        headers = {"Content-Type": "application/json", "x-goog-api-key": self._api_key}

        # Retry transient failures with exponential backoff (2s, 4s by default),
        # matching what the Anthropic SDK does for the Claude path.
        for attempt in range(self.max_retries + 1):
            last_try = attempt == self.max_retries
            try:
                status, raw = self._transport(url, headers, body, self.timeout)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                if last_try:
                    raise EstimatorUnavailable(
                        "Could not reach Google's Gemini service. Check the network "
                        "connection.") from exc
                self._sleep(self.backoff_seconds * 2 ** attempt)
                continue
            if status in RETRYABLE_STATUS and not last_try:
                self._sleep(self.backoff_seconds * 2 ** attempt)
                continue
            break

        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise EstimatorUnavailable(
                f"Google's Gemini service returned an unreadable response ({status}).") from exc

        if status != 200:
            raise error_for_status(status, data, self.profile.model)

        return EstimatorResult(decomposition=parse_response(data),
                               usage=TokenUsage.from_gemini(data.get("usageMetadata")),
                               profile=self.profile)
