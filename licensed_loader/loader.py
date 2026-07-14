"""Build an importable, in-memory package from decrypted project sources.

Client-side counterpart of the server's ``virtual_package``. Because a bot
process loads exactly one project, this is single-tenant: modules are mounted
under their natural top-level names and the finder is inserted at the *front*
of ``sys.meta_path`` so the project's own modules resolve first — matching how
a real project directory on ``sys.path`` would behave. Nothing is written to
disk; sources live only in memory.
"""

from __future__ import annotations

import importlib
import importlib.abc
import importlib.util
import sys
import threading
from types import ModuleType
from typing import Callable, Iterable

from .exceptions import LicenseRevoked

_lock = threading.Lock()


def _natural_name(relative_path: str) -> tuple[str, bool]:
    path = relative_path.replace("\\", "/").strip("/")
    if path.endswith("__init__.py"):
        dotted = path[: -len("/__init__.py")].replace("/", ".") if "/" in path else ""
        return dotted.strip("."), True
    dotted = path[: -len(".py")].replace("/", ".") if path.endswith(".py") else path.replace("/", ".")
    return dotted.strip("."), False


def _parent_prefixes(dotted: str) -> list[str]:
    parts = dotted.split(".")
    return [".".join(parts[:i]) for i in range(1, len(parts))]


class _InMemoryLoader(importlib.abc.Loader):
    def __init__(self, source: str) -> None:
        self._source = source

    def create_module(self, spec):
        return None

    def exec_module(self, module: ModuleType) -> None:
        origin = getattr(module.__spec__, "origin", None) or module.__name__
        exec(compile(self._source, origin, "exec"), module.__dict__)  # noqa: S102


class _MetaFinder(importlib.abc.MetaPathFinder):
    def __init__(self, modules: dict[str, tuple[str, bool]]) -> None:
        self._modules = modules

    def find_spec(self, fullname: str, path: Iterable[str] | None = None, target=None):
        entry = self._modules.get(fullname)
        if entry is None:
            return None
        source, is_package = entry
        spec = importlib.util.spec_from_loader(
            fullname, _InMemoryLoader(source), origin=f"<licensed:{fullname}>", is_package=is_package
        )
        if is_package and spec is not None:
            spec.submodule_search_locations = []
        return spec


class LoadedPackage:
    """The object returned by ``LicensedProject.load()``.

    Access the project's top-level modules as attributes, e.g. ``pkg.core`` or
    ``pkg.economy.core``. After the license is revoked (detected by
    revalidation) any further access raises :class:`LicenseRevoked`.
    """

    def __init__(self, sources: dict[str, str], guard: Callable[[], None] | None = None) -> None:
        self._modules: dict[str, tuple[str, bool]] = {}
        self._top_level: set[str] = set()
        self._guard = guard or (lambda: None)
        self._build(sources)
        self._finder = _MetaFinder(self._modules)
        self._installed = False
        self.install()

    def _build(self, sources: dict[str, str]) -> None:
        for rel_path, source in sources.items():
            dotted, is_pkg = _natural_name(rel_path)
            if not dotted:
                continue
            self._modules[dotted] = (source, is_pkg)
            self._top_level.add(dotted.split(".")[0])
        synthetic: dict[str, tuple[str, bool]] = {}
        for name in list(self._modules):
            for prefix in _parent_prefixes(name):
                if prefix not in self._modules and prefix not in synthetic:
                    synthetic[prefix] = ("", True)
                    self._top_level.add(prefix.split(".")[0])
        self._modules.update(synthetic)

    def install(self) -> None:
        with _lock:
            if not self._installed:
                sys.meta_path.insert(0, self._finder)
                self._installed = True

    def unload(self) -> None:
        """Remove the finder and purge the project's modules from memory."""
        with _lock:
            if self._finder in sys.meta_path:
                sys.meta_path.remove(self._finder)
            self._installed = False
            for name in list(sys.modules):
                mod = sys.modules.get(name)
                origin = getattr(getattr(mod, "__spec__", None), "origin", "") or ""
                if name in self._modules or origin.startswith("<licensed:"):
                    del sys.modules[name]

    @property
    def top_level(self) -> set[str]:
        return set(self._top_level)

    def import_module(self, dotted: str) -> ModuleType:
        self._guard()
        return importlib.import_module(dotted)

    def __getattr__(self, name: str) -> ModuleType:
        if name.startswith("_"):
            raise AttributeError(name)
        self._guard()
        if name in self._top_level:
            return importlib.import_module(name)
        raise AttributeError(f"No top-level module {name!r} in this project")
