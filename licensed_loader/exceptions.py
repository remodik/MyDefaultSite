"""Exceptions raised by licensed_loader."""

from __future__ import annotations


class LicensedLoaderError(Exception):
    """Base class for all licensed_loader errors."""


class LicenseError(LicensedLoaderError):
    """The server refused the license (revoked, expired, wrong key, …).

    The server deliberately does not say *why*; this just means "denied".
    """


class LicenseRevoked(LicenseError):
    """Detected during periodic revalidation — access has been pulled."""


class ServerUnavailable(LicensedLoaderError):
    """The licensing server could not be reached after retries."""


class DecryptionError(LicensedLoaderError):
    """The project archive could not be decrypted with this license key."""
