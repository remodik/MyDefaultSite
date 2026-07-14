"""Licensed-module distribution system.

A self-contained subsystem that lets the site owner (admin) distribute
licensed Python projects to clients (bot buyers) in two modes:

* **Mode A (local)** — the server hands the client an encrypted archive of the
  project's files; the client library decrypts and executes them locally.
  This is the primary, fully-supported mode.
* **Mode B (remote)** — the client sends a call (entrypoint + args) to the
  server, the code runs server-side, and only the result comes back. The
  source never leaves the server. This is an optional extension with a
  deliberately simple in-process sandbox (see ``executor.py``).

All tables live under the ``lic_`` prefix to avoid colliding with the
site's pre-existing ``projects`` / ``files`` / ``licenses`` tables.
"""

from __future__ import annotations

__all__ = ["client_router", "admin_router"]


def __getattr__(name: str):  # pragma: no cover - lazy import to avoid cycles
    if name == "client_router":
        from licensing.client_routes import client_router

        return client_router
    if name == "admin_router":
        from licensing.admin_routes import admin_router

        return admin_router
    raise AttributeError(name)
