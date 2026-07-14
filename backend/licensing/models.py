"""SQLAlchemy models for the licensing subsystem.

All tables use the ``lic_`` prefix so they never collide with the site's
pre-existing ``projects`` / ``files`` / ``licenses`` / ``license_logs``
tables (which belong to unrelated features).

Hierarchy: a **project** is a package folder; it contains **project files**
(``economy/core.py`` etc.). A **license** grants a **client** access to one
project; individual files can be toggled per-license via **module overrides**.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

# License statuses. ``unlocked`` is the terminal "delivered for good" marker:
# the code has been handed over permanently and the server is no longer the
# gatekeeper for this license (see task priorities).
LICENSE_STATUSES = ("active", "suspended", "revoked", "unlocked")
LICENSE_PLANS = ("month", "year", "lifetime")


class LicProject(Base):
    __tablename__ = "lic_projects"
    __table_args__ = (Index("ix_lic_projects_slug", "slug", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    files: Mapped[list["LicProjectFile"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class LicProjectFile(Base):
    __tablename__ = "lic_project_files"
    __table_args__ = (
        UniqueConstraint("project_id", "relative_path", name="uq_lic_file_path"),
        Index("ix_lic_project_files_project_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("lic_projects.id", ondelete="CASCADE"), nullable=False
    )
    # e.g. "economy/core.py" — preserves the package layout.
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    # AES-GCM ciphertext of the source (encrypted at rest with the master key).
    content_enc: Mapped[str] = mapped_column(Text, nullable=False)
    # SHA-256 of the *plaintext* source, for integrity display / diffing.
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Global enable flag (off = nobody gets this file).
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now, nullable=False
    )

    project: Mapped["LicProject"] = relationship(back_populates="files")


class LicClient(Base):
    __tablename__ = "lic_clients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)


class LicLicense(Base):
    __tablename__ = "lic_licenses"
    __table_args__ = (
        Index("ix_lic_licenses_key_hash", "key_hash", unique=True),
        Index("ix_lic_licenses_client_id", "client_id"),
        Index("ix_lic_licenses_project_id", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("lic_clients.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("lic_projects.id", ondelete="CASCADE"), nullable=False
    )
    # We store only the hash + last 4 chars; the plaintext key is shown once.
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    key_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    plan: Mapped[str] = mapped_column(String(8), default="lifetime", nullable=False)
    hardware_fingerprint: Mapped[str | None] = mapped_column(String(256), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Free-form admin note / last status reason.
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now, nullable=False
    )


class LicModuleOverride(Base):
    """Per-license enable/disable of a single project file."""

    __tablename__ = "lic_license_module_overrides"
    __table_args__ = (
        UniqueConstraint("license_id", "project_file_id", name="uq_lic_override"),
        Index("ix_lic_override_license_id", "license_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    license_id: Mapped[int] = mapped_column(
        ForeignKey("lic_licenses.id", ondelete="CASCADE"), nullable=False
    )
    project_file_id: Mapped[int] = mapped_column(
        ForeignKey("lic_project_files.id", ondelete="CASCADE"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)


class LicAccessLog(Base):
    __tablename__ = "lic_access_logs"
    __table_args__ = (
        Index("ix_lic_access_logs_license_id", "license_id"),
        Index("ix_lic_access_logs_requested_at", "requested_at"),
        Index("ix_lic_access_logs_success", "success"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Nullable: a request with an unknown key has no license row.
    license_id: Mapped[int | None] = mapped_column(
        ForeignKey("lic_licenses.id", ondelete="SET NULL"), nullable=True
    )
    project_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("lic_project_files.id", ondelete="SET NULL"), nullable=True
    )
    attempted_key_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    mode: Mapped[str | None] = mapped_column(String(8), nullable=True)  # local / remote
    entrypoint: Mapped[str | None] = mapped_column(String(256), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)
    hardware_fingerprint: Mapped[str | None] = mapped_column(String(256), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # revoked / expired / fingerprint_mismatch / rate_limited / module_disabled / ok / ...
    reason: Mapped[str | None] = mapped_column(String(64), nullable=True)


class LicSecurityFlag(Base):
    """Automatic security detections, kept separate from ordinary access logs."""

    __tablename__ = "lic_security_flags"
    __table_args__ = (
        Index("ix_lic_security_flags_license_id", "license_id"),
        Index("ix_lic_security_flags_detected_at", "detected_at"),
        Index("ix_lic_security_flags_resolved", "resolved"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    license_id: Mapped[int] = mapped_column(
        ForeignKey("lic_licenses.id", ondelete="CASCADE"), nullable=False
    )
    # scrape_rate / multi_fingerprint / repeated_failures
    flag_type: Mapped[str] = mapped_column(String(32), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    auto_action: Mapped[str | None] = mapped_column(String(32), nullable=True)  # e.g. "suspended"
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolution: Mapped[str | None] = mapped_column(String(32), nullable=True)  # revoked / dismissed
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
