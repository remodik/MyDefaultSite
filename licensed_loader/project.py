"""The public ``LicensedProject`` façade — one universal wrapper for both modes.

Mode A (``local``): fetch an encrypted archive, decrypt it in memory, mount it
as a virtual package, and use it like any local package. Mode B (``remote``):
send ``entrypoint`` + kwargs to the server and get back only the result.

The same object supports both; only ``mode`` (and, for local, whether you call
functions on the package vs. via :meth:`call`) differs. A background loop
re-validates the license every ``revalidate_interval`` seconds and, on an
explicit revoke, blocks further use without crashing the host bot.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from typing import Any, Callable

from . import _http, crypto
from .exceptions import LicenseError, LicenseRevoked, LicensedLoaderError, ServerUnavailable
from .fingerprint import hardware_fingerprint
from .loader import LoadedPackage

log = logging.getLogger("licensed_loader")


class LicensedProject:
    def __init__(
        self,
        license_key: str,
        server_url: str,
        project_slug: str,
        *,
        mode: str = "local",
        hardware_fingerprint: str | None = None,
        client_version: str | None = None,
        revalidate_interval: int = 900,
        http_timeout: float = 10.0,
        retries: int = 3,
        verify_ssl: bool = True,
        on_revoke: Callable[[], None] | None = None,
        anti_debug: bool = True,
    ) -> None:
        if mode not in ("local", "remote"):
            raise ValueError("mode must be 'local' or 'remote'")
        self.license_key = license_key
        self.server_url = server_url
        self.project_slug = project_slug
        self.mode = mode
        self.hardware_fingerprint = hardware_fingerprint or _default_fingerprint()
        self.client_version = client_version
        self.revalidate_interval = revalidate_interval
        self.http_timeout = http_timeout
        self.retries = retries
        self.verify_ssl = verify_ssl
        self.on_revoke = on_revoke
        self.anti_debug = anti_debug

        self._package: LoadedPackage | None = None
        self._blocked = False
        self._revalidate_task: asyncio.Task | None = None
        self._payload_received_at: float | None = None

    # -- helpers ------------------------------------------------------------ #
    def _guard(self) -> None:
        if self._blocked:
            raise LicenseRevoked("License is no longer valid; access blocked")

    def _base_payload(self) -> dict[str, Any]:
        return {
            "license_key": self.license_key,
            "project_slug": self.project_slug,
            "hardware_fingerprint": self.hardware_fingerprint,
        }

    def _check_debugger(self) -> None:
        """Coarse anti-tamper: warn if a tracer/debugger is attached or if an
        unusually long pause happened between receiving code and using it."""
        if not self.anti_debug:
            return
        if sys.gettrace() is not None:
            log.warning("licensed_loader: a debugger/tracer is attached")
        if self._payload_received_at is not None:
            gap = time.monotonic() - self._payload_received_at
            if gap > 30:
                log.warning("licensed_loader: %.0fs between fetch and first use (single-stepping?)", gap)

    # -- Mode A: local ------------------------------------------------------ #
    async def load(self) -> LoadedPackage:
        """Fetch, decrypt and mount the project; return the importable package.

        Raises :class:`LicenseError` if the server denies access, or
        :class:`ServerUnavailable` if it cannot be reached.
        """
        self._guard()
        payload = dict(self._base_payload())
        payload["client_version"] = self.client_version

        data = await _http.post_json(
            self.server_url, "/api/v1/project/fetch", payload,
            timeout=self.http_timeout, retries=self.retries, verify_ssl=self.verify_ssl,
        )
        self._payload_received_at = time.monotonic()
        plaintext = crypto.decrypt_archive(data["archive"], self.license_key, self.project_slug)
        manifest = json.loads(plaintext)
        sources: dict[str, str] = manifest["files"]

        if self._package is not None:
            self._package.unload()
        self._package = LoadedPackage(sources, guard=self._guard)

        self._start_revalidation()
        self._check_debugger()
        return self._package

    @property
    def package(self) -> LoadedPackage:
        self._guard()
        if self._package is None:
            raise LicensedLoaderError("Project not loaded; await project.load() first")
        return self._package

    # -- Mode B: remote ----------------------------------------------------- #
    async def call(self, entrypoint: str, **kwargs: Any) -> Any:
        """Invoke ``entrypoint`` (``"module.function"``).

        In ``remote`` mode this runs on the server and returns only the result.
        In ``local`` mode it resolves and calls the function in the loaded
        package (loading it first if necessary).
        """
        self._guard()
        if self.mode == "remote":
            payload = dict(self._base_payload())
            payload.update({
                "entrypoint": entrypoint,
                "args": kwargs,
                "client_version": self.client_version,
            })
            data = await _http.post_json(
                self.server_url, "/api/v1/project/execute", payload,
                timeout=self.http_timeout, retries=self.retries, verify_ssl=self.verify_ssl,
            )
            self._payload_received_at = time.monotonic()
            self._check_debugger()
            return data.get("result")

        # local mode
        if self._package is None:
            await self.load()
        module_dotted, _, attr = entrypoint.rpartition(".")
        if not module_dotted:
            raise ValueError("entrypoint must be 'module.function'")
        module = self.package.import_module(module_dotted)
        func = getattr(module, attr, None)
        if func is None or not callable(func):
            raise AttributeError(f"Unknown entrypoint: {entrypoint}")
        result = func(**kwargs)
        if asyncio.iscoroutine(result):
            result = await result
        return result

    # -- revalidation ------------------------------------------------------- #
    def _start_revalidation(self) -> None:
        if self.revalidate_interval <= 0 or self._revalidate_task is not None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._revalidate_task = loop.create_task(self._revalidation_loop())

    async def _revalidation_loop(self) -> None:
        while not self._blocked:
            try:
                await asyncio.sleep(self.revalidate_interval)
                data = await _http.post_json(
                    self.server_url, "/api/v1/project/validate", self._base_payload(),
                    timeout=self.http_timeout, retries=1, verify_ssl=self.verify_ssl,
                )
                if not data.get("valid", False):
                    self._block()
                    return
            except ServerUnavailable:
                # Transient outage must not disable a paying client — try again
                # next cycle rather than blocking.
                log.debug("licensed_loader: revalidation skipped (server unavailable)")
            except LicenseError:
                self._block()
                return
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.debug("licensed_loader: revalidation error: %s", exc)

    def _block(self) -> None:
        self._blocked = True
        log.warning("licensed_loader: license revoked/invalid — blocking further use")
        if self._package is not None:
            self._package.unload()
            self._package = None
        if self.on_revoke is not None:
            try:
                self.on_revoke()
            except Exception:  # noqa: BLE001
                pass

    async def revalidate_now(self) -> bool:
        """Force an immediate revalidation. Returns True if still valid."""
        try:
            data = await _http.post_json(
                self.server_url, "/api/v1/project/validate", self._base_payload(),
                timeout=self.http_timeout, retries=1, verify_ssl=self.verify_ssl,
            )
        except ServerUnavailable:
            return not self._blocked
        except LicenseError:
            self._block()
            return False
        if not data.get("valid", False):
            self._block()
            return False
        return True

    async def aclose(self) -> None:
        """Stop the revalidation loop and unload the package."""
        if self._revalidate_task is not None:
            self._revalidate_task.cancel()
            try:
                await self._revalidate_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._revalidate_task = None
        if self._package is not None:
            self._package.unload()
            self._package = None

    async def __aenter__(self) -> "LicensedProject":
        if self.mode == "local":
            await self.load()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.aclose()


def _default_fingerprint() -> str:
    try:
        return hardware_fingerprint()
    except Exception:  # noqa: BLE001
        return "unknown"
