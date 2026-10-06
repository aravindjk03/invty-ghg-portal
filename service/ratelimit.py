"""Per-client limit on AI calls. Every uncached estimate costs money, so an
open endpoint without this is an open tab on the API account.

Only real AI calls are counted - answers served from cache are free and are
not limited.
"""
from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int = 3600, clock=time.monotonic):
        self.limit, self.window, self._clock = limit, window_seconds, clock
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self.limit > 0

    def check(self, client: str) -> tuple[bool, int]:
        """(allowed, retry_after_seconds). Records the hit when allowed."""
        if not self.enabled:
            return True, 0
        now = self._clock()
        with self._lock:
            hits = self._hits[client]
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False, max(1, math.ceil(self.window - (now - hits[0])))
            hits.append(now)
            return True, 0
