"""Thin async HTTP client with retry + exponential backoff.

Retries transient failures (network errors, timeouts, 5xx, 429) but never
retries a definitive 403 denial. Network exhaustion surfaces as
``ServerUnavailable`` so callers can decide whether the module is critical.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from .exceptions import LicenseError, ServerUnavailable

_USER_AGENT = "licensed_loader/1.0"


async def post_json(
    base_url: str,
    path: str,
    payload: dict[str, Any],
    *,
    timeout: float = 10.0,
    retries: int = 3,
    backoff_base: float = 0.5,
    verify_ssl: bool = True,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    last_exc: Exception | None = None

    async with httpx.AsyncClient(timeout=timeout, verify=verify_ssl) as client:
        for attempt in range(retries + 1):
            try:
                resp = await client.post(url, json=payload, headers={"User-Agent": _USER_AGENT})
            except (httpx.TransportError, httpx.TimeoutException) as exc:
                last_exc = exc
            else:
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 403:
                    # Definitive denial — do not retry, do not leak the reason.
                    raise LicenseError("Access denied by licensing server")
                if resp.status_code in (429, 500, 502, 503, 504):
                    last_exc = ServerUnavailable(f"HTTP {resp.status_code}")
                else:
                    raise ServerUnavailable(f"Unexpected HTTP {resp.status_code}: {resp.text[:200]}")

            if attempt < retries:
                await asyncio.sleep(backoff_base * (2**attempt))

    raise ServerUnavailable(f"Licensing server unreachable after {retries + 1} attempts") from last_exc
