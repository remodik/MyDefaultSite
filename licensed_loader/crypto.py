"""Client-side decryption of the Mode A project archive.

This mirrors the server's ``licensing.crypto`` transport derivation exactly —
the two must stay in sync. The key is derived from the license key the client
already holds, using HKDF-SHA256 with the per-response salt returned by the
server. The salt is public by design; the license key is the shared secret.
"""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .exceptions import DecryptionError

# --- shared contract with the server (licensing/crypto.py) ---
TRANSPORT_INFO_PREFIX = b"licensed-loader.transport.v1:"
KEY_LEN = 32


def _b64d(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


def derive_transport_key(license_key: str, salt: bytes, project_slug: str) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        info=TRANSPORT_INFO_PREFIX + project_slug.encode("utf-8"),
    )
    return hkdf.derive(license_key.encode("utf-8"))


def decrypt_archive(envelope: dict, license_key: str, project_slug: str) -> bytes:
    """Decrypt the ``archive`` envelope returned by ``/api/v1/project/fetch``."""
    try:
        salt = _b64d(str(envelope["salt"]))
        nonce = _b64d(str(envelope["nonce"]))
        ct = _b64d(str(envelope["ciphertext"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise DecryptionError("Malformed archive envelope") from exc

    key = derive_transport_key(license_key, salt, project_slug)
    try:
        return AESGCM(key).decrypt(nonce, ct, project_slug.encode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - normalise to DecryptionError
        raise DecryptionError(
            "Could not decrypt project archive (wrong license key or corrupt data)"
        ) from exc
