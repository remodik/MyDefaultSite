"""Bounded in-process throttling for login and MCP."""

import ipaddress
import os
import time
from collections import OrderedDict, deque


class RateLimit:
    def __init__(self, keys: int = 4096):
        self._buckets = OrderedDict()
        self._keys = keys

    def allow(self, key: str, count: int, window: int) -> bool:
        now = time.monotonic()
        bucket = self._buckets.setdefault(key, deque())
        self._buckets.move_to_end(key)
        if len(self._buckets) > self._keys:
            self._buckets.popitem(last=False)
        while bucket and bucket[0] <= now - max(1, window):
            bucket.popleft()
        if len(bucket) >= max(1, count):
            return False
        bucket.append(now)
        return True


def client_ip(scope, headers) -> str:
    peer = (scope.get("client") or ("unknown", 0))[0]
    # Uvicorn can replace the peer with the forwarded client IP before this
    # runs. Use explicit opt-in only on a Cloudflare-controlled origin.
    if os.getenv("VAULT_TRUST_PROXY_HEADER", "never").lower() == "always":
        try:
            return str(ipaddress.ip_address(headers.get("cf-connecting-ip", "")))
        except ValueError:
            pass
    return peer
