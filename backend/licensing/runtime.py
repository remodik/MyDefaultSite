"""Mode B (remote execution) engine.

For each ``execute`` call: decrypt the license's effective files (cached with a
short TTL), mount them as a natural package, resolve ``entrypoint``
(``module.func``), run it under a timeout, and return a JSON-serialisable
result. Because the mount uses process-global package names, executions are
**serialised** and the mount is torn down after each call — trading throughput
for correctness/isolation, which is the right call for the optional Mode B.

Caches are invalidated immediately on suspend/revoke (``invalidate_license``)
and on file/override changes (``invalidate_project`` / ``invalidate_license``).
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from licensing.executor import ExecutionError, ExecutionTimeout, default_executor
from licensing.models import LicProjectFile
from licensing.virtual_package import VirtualPackage


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


CACHE_TTL_SECONDS = _int_env("LICENSING_RUNTIME_CACHE_TTL", 300)
EXEC_TIMEOUT_SECONDS = float(_int_env("LICENSING_EXEC_TIMEOUT", 5))


class EntrypointError(Exception):
    """Bad entrypoint format or target does not exist."""


class ModuleDisabledError(Exception):
    """The entrypoint's module exists but is disabled for this license."""


def signature_for(files: list[LicProjectFile]) -> str:
    parts = sorted(f"{f.id}:{f.version}" for f in files)
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


@dataclass
class _Cached:
    project_id: int
    signature: str
    sources: dict[str, str]
    module_map: dict[str, str]  # dotted -> relative_path (effective files only)
    created_at: float = field(default_factory=time.monotonic)

    def expired(self) -> bool:
        return (time.monotonic() - self.created_at) > CACHE_TTL_SECONDS


class ProjectRuntime:
    def __init__(self) -> None:
        self._cache: dict[int, _Cached] = {}
        self._cache_lock = threading.Lock()
        self._exec_lock = asyncio.Lock()
        self._executor = default_executor()

    # -- source cache ------------------------------------------------------- #
    def get_or_build(
        self,
        license_id: int,
        project_id: int,
        signature: str,
        sources: dict[str, str],
        module_map: dict[str, str],
    ) -> _Cached:
        with self._cache_lock:
            cached = self._cache.get(license_id)
            if cached and cached.signature == signature and not cached.expired():
                return cached
            cached = _Cached(project_id, signature, sources, module_map)
            self._cache[license_id] = cached
            return cached

    def invalidate_license(self, license_id: int) -> None:
        with self._cache_lock:
            self._cache.pop(license_id, None)

    def invalidate_project(self, project_id: int) -> None:
        with self._cache_lock:
            for lid in [lid for lid, c in self._cache.items() if c.project_id == project_id]:
                self._cache.pop(lid, None)

    # -- execution ---------------------------------------------------------- #
    async def call(
        self,
        cached: _Cached,
        entrypoint: str,
        args: dict[str, Any],
        all_module_map: dict[str, str],
        timeout: float = EXEC_TIMEOUT_SECONDS,
    ) -> Any:
        module_dotted, attr = _split_entrypoint(entrypoint)
        if module_dotted not in cached.module_map:
            if module_dotted in all_module_map:
                raise ModuleDisabledError(module_dotted)
            raise EntrypointError(f"Unknown module: {module_dotted}")

        # Serialise mounts: natural top-level names are process-global.
        async with self._exec_lock:
            return await asyncio.to_thread(
                self._mount_and_run, dict(cached.sources), module_dotted, attr, args, timeout
            )

    def _mount_and_run(
        self,
        sources: dict[str, str],
        module_dotted: str,
        attr: str,
        args: dict[str, Any],
        timeout: float,
    ) -> Any:
        vp = VirtualPackage(sources)
        vp.install()
        try:
            def invoke() -> Any:
                module = vp.import_module(module_dotted)
                func = getattr(module, attr, None)
                if func is None or not callable(func):
                    raise EntrypointError(f"Unknown entrypoint: {module_dotted}.{attr}")
                result = func(**args)
                if inspect.isawaitable(result):
                    result = asyncio.run(result)
                _ensure_json_serialisable(result)
                return result

            try:
                return self._executor.run(invoke, timeout).value
            except (ExecutionTimeout, EntrypointError, ModuleDisabledError, ExecutionError):
                raise
            except BaseException as exc:  # noqa: BLE001 - a bug in the owner's code
                raise ExecutionError(str(exc) or exc.__class__.__name__, exc)
        finally:
            vp.uninstall()


def _split_entrypoint(entrypoint: str) -> tuple[str, str]:
    entrypoint = (entrypoint or "").strip()
    if "." not in entrypoint:
        raise EntrypointError("Entrypoint must be 'module.function'")
    module_dotted, _, attr = entrypoint.rpartition(".")
    if not module_dotted or not attr:
        raise EntrypointError("Entrypoint must be 'module.function'")
    return module_dotted, attr


def _ensure_json_serialisable(value: Any) -> None:
    try:
        json.dumps(value)
    except (TypeError, ValueError) as exc:
        raise ExecutionError(f"Entrypoint result is not JSON-serialisable: {exc}") from exc


runtime = ProjectRuntime()

__all__ = [
    "runtime",
    "ProjectRuntime",
    "EntrypointError",
    "ModuleDisabledError",
    "ExecutionError",
    "ExecutionTimeout",
    "signature_for",
    "EXEC_TIMEOUT_SECONDS",
]
