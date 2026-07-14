"""Shared query / domain helpers for the licensing subsystem.

Used by both the public client routes (fetch / execute) and the admin routes,
so the effective-file computation and validity rules live in exactly one place.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from licensing import crypto
from licensing.models import (
    LicAccessLog,
    LicLicense,
    LicModuleOverride,
    LicProject,
    LicProjectFile,
)


async def get_project_by_slug(session: AsyncSession, slug: str) -> LicProject | None:
    result = await session.execute(select(LicProject).where(LicProject.slug == slug))
    return result.scalar_one_or_none()


async def resolve_license(session: AsyncSession, license_key: str) -> LicLicense | None:
    """Look a license up by the SHA-256 of the presented key."""
    key_hash = crypto.hash_license_key(license_key)
    result = await session.execute(select(LicLicense).where(LicLicense.key_hash == key_hash))
    return result.scalar_one_or_none()


def validity_reason(
    license_row: LicLicense,
    *,
    now: datetime,
    fingerprint: str | None,
) -> str | None:
    """Return a denial reason string, or ``None`` if the license may be served.

    ``unlocked`` is the terminal "delivered" state: the client owns the code
    permanently, so we serve it without expiry or fingerprint enforcement.
    """
    if license_row.status == "unlocked":
        return None
    if license_row.status == "revoked":
        return "revoked"
    if license_row.status == "suspended":
        return "suspended"
    if license_row.status != "active":
        return "inactive"
    if license_row.expires_at is not None and license_row.expires_at <= now:
        return "expired"
    if (
        license_row.hardware_fingerprint
        and fingerprint
        and license_row.hardware_fingerprint != fingerprint
    ):
        return "fingerprint_mismatch"
    return None


async def get_all_project_files(session: AsyncSession, project_id: int) -> list[LicProjectFile]:
    result = await session.execute(
        select(LicProjectFile)
        .where(LicProjectFile.project_id == project_id)
        .order_by(LicProjectFile.relative_path)
    )
    return list(result.scalars().all())


async def _disabled_override_ids(session: AsyncSession, license_id: int) -> set[int]:
    result = await session.execute(
        select(LicModuleOverride.project_file_id).where(
            LicModuleOverride.license_id == license_id,
            LicModuleOverride.is_enabled.is_(False),
        )
    )
    return {row[0] for row in result.all()}


async def get_effective_files(
    session: AsyncSession, license_row: LicLicense
) -> list[LicProjectFile]:
    """Files this specific license may receive/execute.

    Final set = (file enabled globally) AND (not disabled by a per-license
    override).
    """
    all_files = await get_all_project_files(session, license_row.project_id)
    disabled = await _disabled_override_ids(session, license_row.id)
    return [f for f in all_files if f.is_enabled and f.id not in disabled]


def decrypt_sources(files: list[LicProjectFile]) -> dict[str, str]:
    """Decrypt a list of files into ``{relative_path: source}``."""
    return {f.relative_path: crypto.decrypt_at_rest(f.content_enc) for f in files}


def module_path_map(files: list[LicProjectFile]) -> dict[str, str]:
    """Map dotted module path -> relative_path for the given files.

    ``economy/core.py`` -> ``economy.core``; ``economy/__init__.py`` ->
    ``economy``. Used to tell "module disabled for this license" apart from
    "module does not exist".
    """
    out: dict[str, str] = {}
    for f in files:
        path = f.relative_path.replace("\\", "/").strip("/")
        if not path.endswith(".py"):
            continue
        if path.endswith("__init__.py"):
            dotted = path[: -len("/__init__.py")].replace("/", ".")
        else:
            dotted = path[: -len(".py")].replace("/", ".")
        dotted = dotted.strip(".")
        if dotted:
            out[dotted] = f.relative_path
    return out


async def log_access(
    session: AsyncSession,
    *,
    success: bool,
    reason: str | None,
    license_id: int | None = None,
    project_file_id: int | None = None,
    attempted_key_last4: str | None = None,
    mode: str | None = None,
    entrypoint: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    hardware_fingerprint: str | None = None,
) -> None:
    session.add(
        LicAccessLog(
            license_id=license_id,
            project_file_id=project_file_id,
            attempted_key_last4=attempted_key_last4,
            mode=mode,
            entrypoint=entrypoint,
            requested_at=datetime.now(),
            ip_address=ip_address,
            user_agent=(user_agent or "")[:256] or None,
            hardware_fingerprint=hardware_fingerprint,
            success=success,
            reason=reason,
        )
    )
