"""What the caller is entitled to, asked of the backend that owns the account.

The free plan includes a small number of AI estimates. That count is NOT kept
here: the backend owns users, sessions and the database, so it owns the count
too. A quota held in two places is a quota that disagrees with itself, and the
one a customer would find is whichever is larger.

The order matters. A credit is RESERVED before the model is called and refunded
if the answer never arrives:

  - reserving afterwards lets two requests arriving together both read "one
    used", both proceed, and hand out a third estimate free;
  - not refunding charges a customer one of their two for a failure that was
    ours.

Cached answers never reach this module. They cost nothing to serve, so they
cost the customer nothing either.
"""
from __future__ import annotations

import http.client
import json
import os
import threading
import time
import urllib.parse
from dataclasses import dataclass
from typing import Optional

TIMEOUT_SECONDS = 8.0

#: How long a resolved token is trusted without asking the backend again. Short,
#: because it is how long a signed-out session stays usable.
_SESSION_TTL_SECONDS = 60.0
_sessions: dict[str, tuple[float, Optional[str]]] = {}
_sessions_lock = threading.Lock()


class BackendUnavailable(RuntimeError):
    """The account service could not be reached."""


class NotSignedIn(RuntimeError):
    """No usable session. The page asks the visitor to sign in."""


class EstimateLimitReached(RuntimeError):
    """The free allowance is spent. Carries the message the page shows."""

    def __init__(self, message: str, entitlement: Optional[dict] = None):
        super().__init__(message)
        self.entitlement = entitlement or {}


@dataclass(frozen=True)
class Reservation:
    user_id: str
    ledger_id: Optional[str]
    plan: str
    entitlement: dict

    @property
    def is_premium(self) -> bool:
        return self.plan == "premium"


def _backend() -> tuple[str, int, bool, str]:
    """(host, port, https, path prefix) of the account service."""
    base = os.environ.get("BACKEND_BASE_URL", "http://localhost:5000/api/v1").rstrip("/")
    parsed = urllib.parse.urlparse(base)
    https = parsed.scheme == "https"
    port = parsed.port or (443 if https else 80)
    return parsed.hostname or "localhost", port, https, parsed.path or ""


def _call(method: str, path: str, *, body: Optional[dict] = None,
          headers: Optional[dict] = None) -> tuple[int, dict]:
    host, port, https, prefix = _backend()
    connection = (http.client.HTTPSConnection if https else http.client.HTTPConnection)(
        host, port, timeout=TIMEOUT_SECONDS)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        request_headers["Content-Type"] = "application/json"
    try:
        connection.request(method, f"{prefix}{path}", body=payload, headers=request_headers)
        response = connection.getresponse()
        raw = response.read()
        status = response.status
    except (OSError, http.client.HTTPException) as error:
        raise BackendUnavailable(
            f"The account service could not be reached ({error.__class__.__name__}).") from None
    finally:
        connection.close()

    try:
        return status, json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise BackendUnavailable("The account service returned something unreadable.") from None


def _service_secret() -> str:
    secret = os.environ.get("ESTIMATE_SERVICE_SECRET", "")
    if not secret:
        # Refusing is the safe failure. Without the secret the backend will not
        # spend a credit, so carrying on would mean estimates that nobody paid
        # for and a free plan that is not a plan.
        raise BackendUnavailable(
            "ESTIMATE_SERVICE_SECRET is not set, so estimates cannot be metered. Set the "
            "same value here and on the account service.")
    return secret


def user_for_token(token: str) -> str:
    """The account behind a bearer token, or NotSignedIn."""
    if not token:
        raise NotSignedIn("Sign in to use the product estimator.")

    now = time.monotonic()
    with _sessions_lock:
        cached = _sessions.get(token)
        if cached and now - cached[0] < _SESSION_TTL_SECONDS:
            if cached[1] is None:
                raise NotSignedIn("That session has expired. Sign in again.")
            return cached[1]

    status, body = _call("GET", "/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = (body.get("user") or {}).get("id") if status == 200 else None

    with _sessions_lock:
        _sessions[token] = (now, user_id)

    if not user_id:
        raise NotSignedIn("That session has expired. Sign in again.")
    return user_id


def reserve(token: str, product: str) -> Reservation:
    """Spend one estimate for this account, or raise EstimateLimitReached."""
    user_id = user_for_token(token)
    status, body = _call(
        "POST", "/entitlements/reserve",
        body={"userId": user_id, "product": product},
        headers={"X-Service-Secret": _service_secret()},
    )

    if status == 402:
        raise EstimateLimitReached(
            (body.get("error") or {}).get("message")
            or "The estimates included with the free plan are used up.",
            body.get("entitlement"))
    if status != 200 or not body.get("success"):
        raise BackendUnavailable(
            (body.get("error") or {}).get("message")
            or f"The account service answered {status} when metering this estimate.")

    entitlement = body.get("entitlement") or {}
    return Reservation(
        user_id=user_id,
        ledger_id=body.get("ledgerId"),
        plan=entitlement.get("plan", "free"),
        entitlement=entitlement,
    )


def refund(reservation: Reservation, reason: str) -> None:
    """Give back a reserved estimate that was never delivered.

    Best effort on purpose: if the refund itself fails there is nothing useful
    to tell the visitor, who already has an error in front of them. It is
    logged by the caller instead.
    """
    if not reservation.ledger_id:
        return
    _call("POST", "/entitlements/refund",
          body={"userId": reservation.user_id, "ledgerId": reservation.ledger_id,
                "reason": reason},
          headers={"X-Service-Secret": _service_secret()})


def entitlement_for(token: str) -> dict:
    """What this account may do, for the page to show."""
    status, body = _call("GET", "/entitlements",
                         headers={"Authorization": f"Bearer {token}"})
    if status != 200:
        raise NotSignedIn("Sign in to see your plan.")
    return body.get("entitlement") or {}
