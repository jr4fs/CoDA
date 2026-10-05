"""
Concurrency-limited queue for dataset sampling jobs.

Sampling (embeddings + FAISS + coverage selection) is memory-heavy: each job
loads the dataset and builds embeddings. Running many at once can exhaust the
host's RAM and crash the service. This queue caps how many run concurrently
(MAX_CONCURRENT_SAMPLING, default 1); extra jobs wait in FIFO order. A few
minutes of queue wait is preferable to an out-of-memory crash.

It also reports how many jobs are ahead of a given job so callers can surface a
queue position in the UI.
"""
import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Awaitable, Callable, Optional, Union

logger = logging.getLogger("uvicorn.error")

MAX_CONCURRENT_SAMPLING = max(1, int(os.getenv("MAX_CONCURRENT_SAMPLING", "1")))

PositionCallback = Callable[[int], Union[None, Awaitable[None]]]


async def _maybe_await(value: Union[None, Awaitable[None]]) -> None:
    if asyncio.iscoroutine(value):
        await value


class SamplingQueue:
    def __init__(self, max_concurrent: int):
        self._max = max_concurrent
        # A dedicated executor (separate from asyncio's default thread pool used
        # for inference) so sampling concurrency is capped independently and
        # CPU-heavy sampling cannot starve the inference threads.
        self._executor = ThreadPoolExecutor(
            max_workers=max_concurrent, thread_name_prefix="sampling"
        )
        self._sem = asyncio.Semaphore(max_concurrent)
        self._lock = asyncio.Lock()
        self._running = 0
        self._waiting = 0

    async def submit(
        self,
        job: Callable[[], None],
        on_position: Optional[PositionCallback] = None,
    ):
        """Run blocking ``job`` under the concurrency limit.

        ``on_position(ahead)`` is invoked (if provided) with the number of jobs
        ahead of this one: a positive number while queued, then ``0`` right
        before the job starts executing.
        """
        async with self._lock:
            ahead = self._running + self._waiting
            self._waiting += 1
        if on_position is not None:
            await _maybe_await(on_position(ahead))
        logger.info(
            "sampling job queued: %d ahead (running=%d waiting=%d max=%d)",
            ahead,
            self._running,
            self._waiting,
            self._max,
        )

        waiting_counted = True
        try:
            async with self._sem:
                async with self._lock:
                    self._waiting -= 1
                    waiting_counted = False
                    self._running += 1
                if on_position is not None:
                    await _maybe_await(on_position(0))
                try:
                    loop = asyncio.get_running_loop()
                    return await loop.run_in_executor(self._executor, job)
                finally:
                    async with self._lock:
                        self._running -= 1
        finally:
            if waiting_counted:
                async with self._lock:
                    self._waiting -= 1


sampling_queue = SamplingQueue(MAX_CONCURRENT_SAMPLING)
