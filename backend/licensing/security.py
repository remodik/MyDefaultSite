"""Automatic protective triggers (kill switch) for the licensing subsystem.

Beyond the admin's manual suspend/revoke, this watches live traffic and
auto-suspends a license (reversible) when it looks compromised:

* **scrape_rate** — too many requests from one key in a short window.
* **multi_fingerprint** — one key used from several hardware fingerprints at
  once (a leaked key).
* **repeated_failures** — a burst of bad payloads / unknown entrypoints.

Detection state lives in-process (per worker). Enforcement is the *persisted*
license status, so even across workers a suspend takes effect on the next
request. On any trigger we: flip status to ``suspended`` (never ``revoked`` —
that stays a human decision), record a :class:`LicSecurityFlag`, invalidate
runtime caches, and fire an admin webhook.
"""

from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from licensing.models import LicLicense, LicSecurityFlag


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


# Hard rate limit (reject beyond this). Also the floor for scrape detection.
RATE_LIMIT_MAX = _int_env("LICENSING_RATE_LIMIT_MAX", 60)
RATE_LIMIT_WINDOW = _int_env("LICENSING_RATE_LIMIT_WINDOW", 60)

# Auto-suspend thresholds.
SCRAPE_MAX = _int_env("LICENSING_SCRAPE_MAX", 200)
SCRAPE_WINDOW = _int_env("LICENSING_SCRAPE_WINDOW", 60)
MULTI_FP_MAX = _int_env("LICENSING_MULTI_FP_MAX", 2)
MULTI_FP_WINDOW = _int_env("LICENSING_MULTI_FP_WINDOW", 300)
FAILURE_MAX = _int_env("LICENSING_FAILURE_MAX", 12)
FAILURE_WINDOW = _int_env("LICENSING_FAILURE_WINDOW", 120)

ALERT_WEBHOOK = os.getenv("LICENSING_ALERT_WEBHOOK", "")


@dataclass
class _KeyState:
    requests: deque[float] = field(default_factory=deque)
    failures: deque[float] = field(default_factory=deque)
    fingerprints: dict[str, float] = field(default_factory=dict)


def _prune(dq: deque[float], window: float, now: float) -> None:
    cutoff = now - window
    while dq and dq[0] < cutoff:
        dq.popleft()


class SecurityMonitor:
    """In-process sliding-window anomaly detector."""

    def __init__(self) -> None:
        self._state: dict[str, _KeyState] = defaultdict(_KeyState)
        self._lock = threading.Lock()

    def record_request(self, key_hash: str) -> None:
        now = time.monotonic()
        with self._lock:
            st = self._state[key_hash]
            st.requests.append(now)
            _prune(st.requests, max(RATE_LIMIT_WINDOW, SCRAPE_WINDOW), now)

    def over_rate_limit(self, key_hash: str) -> bool:
        now = time.monotonic()
        with self._lock:
            st = self._state[key_hash]
            window = [t for t in st.requests if t >= now - RATE_LIMIT_WINDOW]
            return len(window) > RATE_LIMIT_MAX

    def record_failure(self, key_hash: str) -> None:
        now = time.monotonic()
        with self._lock:
            st = self._state[key_hash]
            st.failures.append(now)
            _prune(st.failures, FAILURE_WINDOW, now)

    def record_fingerprint(self, key_hash: str, fingerprint: str | None) -> None:
        if not fingerprint:
            return
        now = time.monotonic()
        with self._lock:
            st = self._state[key_hash]
            st.fingerprints[fingerprint] = now
            stale = [fp for fp, ts in st.fingerprints.items() if ts < now - MULTI_FP_WINDOW]
            for fp in stale:
                del st.fingerprints[fp]

    def anomalies(self, key_hash: str) -> list[tuple[str, dict]]:
        """Return the list of currently-tripped anomalies for a key."""
        now = time.monotonic()
        found: list[tuple[str, dict]] = []
        with self._lock:
            st = self._state.get(key_hash)
            if st is None:
                return found
            reqs = [t for t in st.requests if t >= now - SCRAPE_WINDOW]
            if len(reqs) > SCRAPE_MAX:
                found.append(("scrape_rate", {"count": len(reqs), "window_s": SCRAPE_WINDOW}))
            fails = [t for t in st.failures if t >= now - FAILURE_WINDOW]
            if len(fails) > FAILURE_MAX:
                found.append(("repeated_failures", {"count": len(fails), "window_s": FAILURE_WINDOW}))
            fps = [fp for fp, ts in st.fingerprints.items() if ts >= now - MULTI_FP_WINDOW]
            if len(fps) >= MULTI_FP_MAX:
                found.append(("multi_fingerprint", {"fingerprints": len(fps), "window_s": MULTI_FP_WINDOW}))
        return found

    def reset(self, key_hash: str) -> None:
        with self._lock:
            self._state.pop(key_hash, None)


monitor = SecurityMonitor()


async def send_alert(text: str) -> None:
    """Fire-and-forget webhook alert (Discord ``content`` / Slack ``text``)."""
    if not ALERT_WEBHOOK:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(ALERT_WEBHOOK, json={"content": text, "text": text})
    except Exception:  # noqa: BLE001 - alerts must never break the request path
        pass


async def evaluate(session: AsyncSession, license_row: LicLicense) -> str | None:
    """Check anomalies for a license and auto-suspend if any tripped.

    Returns the flag type that triggered a suspend, or ``None``. Safe to call
    on every request; it no-ops unless a threshold is crossed and the license
    is currently ``active``.
    """
    anomalies = monitor.anomalies(license_row.key_hash)
    if not anomalies:
        return None

    triggered: str | None = None
    for flag_type, details in anomalies:
        flag = LicSecurityFlag(
            license_id=license_row.id,
            flag_type=flag_type,
            detected_at=datetime.now(),
            details=json.dumps(details, ensure_ascii=False),
            auto_action="suspended" if license_row.status == "active" else None,
            resolved=False,
        )
        session.add(flag)
        if license_row.status == "active" and triggered is None:
            triggered = flag_type

    if triggered:
        license_row.status = "suspended"
        license_row.note = f"auto-suspend: {triggered}"
        # Break the runtime cache so a suspended license can't reuse warm state.
        try:
            from licensing.runtime import runtime

            runtime.invalidate_license(license_row.id)
        except Exception:  # noqa: BLE001
            pass
        await send_alert(
            f"⚠️ Licensing auto-suspend: license #{license_row.id} "
            f"(…{license_row.key_last4}) flagged **{triggered}**. "
            f"Review in the admin panel → Security events."
        )
    return triggered
