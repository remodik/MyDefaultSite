"""Cryptographic primitives for the licensing subsystem.

Three separate concerns, kept intentionally distinct:

1. **At-rest encryption** of project file content stored in the DB, using a
   server master secret (``LICENSING_MASTER_KEY``). Protects a DB dump.
2. **Transport encryption** (Mode A) of the project archive handed to a
   client, using a key *derived from the client's own license key* via HKDF
   plus a fresh per-response salt. The client reproduces the key from the
   license key it already holds. The salt is public by design (HKDF salts
   need not be secret) and is returned alongside the ciphertext.
3. **License key** generation / hashing. We never store the plaintext key —
   only its SHA-256 hash (for lookup) and last 4 chars (for display).

The transport derivation constants below are the contract shared with the
``licensed_loader`` client library; keep them in sync.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

# --- shared contract with licensed_loader (DO NOT change without bumping v) ---
TRANSPORT_VERSION = 1
TRANSPORT_INFO_PREFIX = b"licensed-loader.transport.v1:"
KEY_LEN = 32  # AES-256
NONCE_LEN = 12
SALT_LEN = 16

# --- at-rest ---
_AT_REST_INFO = b"licensing.at-rest.v1"
_AT_REST_SALT = b"licensing.at-rest.salt.v1"
_AT_REST_PREFIX = "v1:"


class CryptoError(Exception):
    """Raised on any encrypt/decrypt failure."""


def _b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64d(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


# --------------------------------------------------------------------------- #
# Master key (at-rest)
# --------------------------------------------------------------------------- #
def _master_secret() -> bytes:
    """Return the raw secret used to derive the at-rest key.

    Prefers ``LICENSING_MASTER_KEY``. Falls back to the app ``SECRET_KEY`` so
    the subsystem works out of the box in development, but that fallback is a
    dev convenience only — production must set ``LICENSING_MASTER_KEY``.
    """
    secret = os.getenv("LICENSING_MASTER_KEY") or os.getenv("SECRET_KEY")
    if not secret:
        raise CryptoError(
            "Neither LICENSING_MASTER_KEY nor SECRET_KEY is set; cannot "
            "encrypt/decrypt licensed project files."
        )
    return secret.encode("utf-8")


def _at_rest_key() -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=_AT_REST_SALT,
        info=_AT_REST_INFO,
    )
    return hkdf.derive(_master_secret())


def encrypt_at_rest(plaintext: str) -> str:
    """Encrypt file source for storage in the DB. Returns ``v1:<b64>``."""
    key = _at_rest_key()
    nonce = os.urandom(NONCE_LEN)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return _AT_REST_PREFIX + _b64e(nonce + ct)


def decrypt_at_rest(blob: str) -> str:
    """Inverse of :func:`encrypt_at_rest`."""
    if not blob.startswith(_AT_REST_PREFIX):
        raise CryptoError("Unrecognised at-rest ciphertext format")
    raw = _b64d(blob[len(_AT_REST_PREFIX):])
    nonce, ct = raw[:NONCE_LEN], raw[NONCE_LEN:]
    try:
        pt = AESGCM(_at_rest_key()).decrypt(nonce, ct, None)
    except Exception as exc:  # noqa: BLE001 - normalise to CryptoError
        raise CryptoError("Failed to decrypt at-rest content") from exc
    return pt.decode("utf-8")


# --------------------------------------------------------------------------- #
# Transport key (Mode A) — derived from the license key
# --------------------------------------------------------------------------- #
def derive_transport_key(license_key: str, salt: bytes, project_slug: str) -> bytes:
    """Derive the symmetric key used to encrypt a project archive for a client.

    Mirrors the client-side derivation in ``licensed_loader.crypto``. ``salt``
    is the fresh per-response salt (public); ``license_key`` is the shared
    secret both sides possess.
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        info=TRANSPORT_INFO_PREFIX + project_slug.encode("utf-8"),
    )
    return hkdf.derive(license_key.encode("utf-8"))


def encrypt_archive(plaintext: bytes, license_key: str, project_slug: str) -> dict[str, object]:
    """Encrypt a project archive for transport to a client.

    Returns a JSON-serialisable envelope the client can decrypt with only its
    license key.
    """
    salt = os.urandom(SALT_LEN)
    nonce = os.urandom(NONCE_LEN)
    key = derive_transport_key(license_key, salt, project_slug)
    ct = AESGCM(key).encrypt(nonce, plaintext, project_slug.encode("utf-8"))
    return {
        "v": TRANSPORT_VERSION,
        "alg": "AES-256-GCM+HKDF-SHA256",
        "salt": _b64e(salt),
        "nonce": _b64e(nonce),
        "ciphertext": _b64e(ct),
    }


def decrypt_archive(envelope: dict[str, object], license_key: str, project_slug: str) -> bytes:
    """Server-side counterpart used by tests; the real consumer is the client."""
    salt = _b64d(str(envelope["salt"]))
    nonce = _b64d(str(envelope["nonce"]))
    ct = _b64d(str(envelope["ciphertext"]))
    key = derive_transport_key(license_key, salt, project_slug)
    try:
        return AESGCM(key).decrypt(nonce, ct, project_slug.encode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise CryptoError("Failed to decrypt project archive") from exc


# --------------------------------------------------------------------------- #
# License keys
# --------------------------------------------------------------------------- #
_KEY_PREFIX = "LL"


def generate_license_key() -> str:
    """Generate a cryptographically strong, human-copyable license key."""
    body = secrets.token_urlsafe(30)  # ~40 chars, url-safe
    return f"{_KEY_PREFIX}_{body}"


def hash_license_key(license_key: str) -> str:
    """SHA-256 hex of a license key — what we actually persist."""
    return hashlib.sha256(license_key.encode("utf-8")).hexdigest()


def constant_time_key_match(license_key: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_license_key(license_key), expected_hash)


def checksum(source: str) -> str:
    """SHA-256 hex of plaintext source, stored per file for integrity."""
    return hashlib.sha256(source.encode("utf-8")).hexdigest()
