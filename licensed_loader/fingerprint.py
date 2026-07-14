"""Best-effort hardware fingerprint for binding a license to a machine.

Not a security boundary — just a stable-ish identifier so the owner can spot a
key being used from several machines at once. Derived from the platform, node
name and MAC; hashed so the raw values never leave the machine.
"""

from __future__ import annotations

import hashlib
import platform
import uuid


def hardware_fingerprint() -> str:
    parts = [
        platform.system(),
        platform.machine(),
        platform.node(),
        hex(uuid.getnode()),  # MAC-derived; stable per NIC
    ]
    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]
