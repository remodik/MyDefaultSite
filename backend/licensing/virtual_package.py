"""Assemble a project's files into an importable, in-memory package tree.

Given ``{relative_path: source}`` (e.g. ``economy/core.py``), this mounts the
files under their **natural** top-level package names via a custom
:mod:`importlib` finder, writing nothing to disk. So a file doing
``from economy.helpers import bonus`` resolves exactly as it would from a real
package — which is the requirement: intra-project imports must "just work".

This loader backs Mode B (server-side remote execution). Because natural
top-level names are process-global, the runtime serialises Mode B executions
and purges the mount afterwards (see ``runtime.py``); two projects that both
contain a top-level ``utils`` therefore never collide. The ``licensed_loader``
client ships its own, single-tenant variant for Mode A.
"""

from __future__ import annotations

import importlib
import importlib.abc
import importlib.util
import sys
import threading
from types import ModuleType
from typing import Iterable

_lock = threading.Lock()


def natural_module_name(relative_path: str) -> tuple[str, bool]:
    """Map a relative file path to its natural (dotted name, is_package).

    ``core.py``              -> (``core``, False)
    ``economy/core.py``      -> (``economy.core``, False)
    ``economy/__init__.py``  -> (``economy``, True)
    """
    path = relative_path.replace("\\", "/").strip("/")
    if not path.endswith(".py"):
        raise ValueError(f"Not a Python file: {relative_path!r}")
    if path.endswith("__init__.py"):
        dotted = path[: -len("/__init__.py")].replace("/", ".") if "/" in path else ""
        is_package = True
    else:
        dotted = path[: -len(".py")].replace("/", ".")
        is_package = False
    dotted = dotted.strip(".")
    return dotted, is_package


def _parent_prefixes(dotted: str) -> list[str]:
    parts = dotted.split(".")
    return [".".join(parts[:i]) for i in range(1, len(parts))]


class _InMemoryLoader(importlib.abc.Loader):
    def __init__(self, source: str, is_package: bool) -> None:
        self._source = source
        self._is_package = is_package

    def create_module(self, spec):  # noqa: D401 - importlib protocol
        return None

    def exec_module(self, module: ModuleType) -> None:
        origin = getattr(module.__spec__, "origin", None) or module.__name__
        code = compile(self._source, origin, "exec")
        exec(code, module.__dict__)  # noqa: S102 - the owner's own code


class _MetaFinder(importlib.abc.MetaPathFinder):
    def __init__(self, modules: dict[str, tuple[str, bool]]) -> None:
        self._modules = modules

    def find_spec(self, fullname: str, path: Iterable[str] | None = None, target=None):
        entry = self._modules.get(fullname)
        if entry is None:
            return None
        source, is_package = entry
        loader = _InMemoryLoader(source, is_package)
        spec = importlib.util.spec_from_loader(
            fullname, loader, origin=f"<licensed:{fullname}>", is_package=is_package
        )
        if is_package and spec is not None:
            spec.submodule_search_locations = []
        return spec


class VirtualPackage:
    """A set of project files mounted under their natural package names."""

    def __init__(self, sources: dict[str, str]) -> None:
        # dotted name -> (source, is_package)
        self._modules: dict[str, tuple[str, bool]] = {}
        self._top_level: set[str] = set()
        self._build(sources)
        self._finder = _MetaFinder(self._modules)
        self._installed = False

    def _build(self, sources: dict[str, str]) -> None:
        for rel_path, source in sources.items():
            dotted, is_pkg = natural_module_name(rel_path)
            if not dotted:
                continue
            self._modules[dotted] = (source, is_pkg)
            self._top_level.add(dotted.split(".")[0])
        # Synthesise namespace packages for any intermediate dir lacking
        # an __init__.py, so deep imports still resolve.
        synthetic: dict[str, tuple[str, bool]] = {}
        for name in list(self._modules):
            for prefix in _parent_prefixes(name):
                if prefix not in self._modules and prefix not in synthetic:
                    synthetic[prefix] = ("", True)
                    self._top_level.add(prefix.split(".")[0])
        self._modules.update(synthetic)

    @property
    def top_level_names(self) -> set[str]:
        return set(self._top_level)

    def install(self, front: bool = False) -> None:
        with _lock:
            if self._installed:
                return
            if front:
                sys.meta_path.insert(0, self._finder)
            else:
                sys.meta_path.append(self._finder)
            self._installed = True

    def uninstall(self) -> None:
        with _lock:
            if self._finder in sys.meta_path:
                sys.meta_path.remove(self._finder)
            self._installed = False
            for name in list(sys.modules):
                top = name.split(".")[0]
                if name in self._modules or top in self._top_level:
                    # Only purge modules we own (loaded by our loader) or their
                    # synthesized packages.
                    mod = sys.modules.get(name)
                    spec = getattr(mod, "__spec__", None)
                    origin = getattr(spec, "origin", "") or ""
                    if name in self._modules or origin.startswith("<licensed:"):
                        del sys.modules[name]

    def import_module(self, dotted: str) -> ModuleType:
        return importlib.import_module(dotted)

    def __enter__(self) -> "VirtualPackage":
        self.install()
        return self

    def __exit__(self, *exc) -> None:
        self.uninstall()
