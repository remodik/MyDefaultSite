"""licensed_loader — client library for licensed, server-gated Python projects.

Usage (Mode A — code runs locally):

    from licensed_loader import LicensedProject

    project = LicensedProject(
        license_key="LL_...",
        server_url="https://example.ru",
        project_slug="economy-bot",
        mode="local",
    )
    pkg = await project.load()
    reward = pkg.core.calculate_reward(user_id=123)

Usage (Mode B — code runs on the server):

    project = LicensedProject(..., mode="remote")
    reward = await project.call("core.calculate_reward", user_id=123)

See README.md for integration into a py-cord / aiogram bot.
"""

from __future__ import annotations

from .exceptions import (
    DecryptionError,
    LicensedLoaderError,
    LicenseError,
    LicenseRevoked,
    ServerUnavailable,
)
from .discord_guard import attach as attach_discord
from .fingerprint import hardware_fingerprint
from .loader import LoadedPackage
from .project import LicensedProject

__version__ = "1.1.0"

__all__ = [
    "LicensedProject",
    "LoadedPackage",
    "attach_discord",
    "LicensedLoaderError",
    "LicenseError",
    "LicenseRevoked",
    "ServerUnavailable",
    "DecryptionError",
    "hardware_fingerprint",
    "__version__",
]
