"""Execution sandbox for Mode B (remote execution).

The code executed here is the **site owner's own** code, run on behalf of a
client — so the goal is resource containment (timeouts, not crashing the
server, keeping projects isolated from one another), *not* defending against
hostile code. That is why the default executor is a simple thread with a
timeout.

>>> SECURITY NOTE <<<
`ThreadExecutor` cannot forcibly kill a runaway thread (Python has no safe
thread-kill); on timeout it abandons the thread and returns an error. It also
provides no memory/CPU isolation. For production use with sensitive data or
untrusted project code, swap in `ProcessExecutor` (POSIX only; adds a hard
kill and `resource` limits) or a container/worker-pool with seccomp. The
`Executor` protocol below exists precisely so that swap is a one-line change.
"""

from __future__ import annotations

import os
import queue
import threading
from dataclasses import dataclass
from typing import Any, Callable, Protocol


class ExecutionTimeout(Exception):
    pass


class ExecutionError(Exception):
    """Wraps an exception raised inside the executed function."""

    def __init__(self, message: str, original: BaseException | None = None) -> None:
        super().__init__(message)
        self.original = original


@dataclass
class ExecutionResult:
    value: Any


class Executor(Protocol):
    def run(self, func: Callable[[], Any], timeout: float) -> ExecutionResult: ...


class ThreadExecutor:
    """Run ``func`` in a daemon thread, giving up after ``timeout`` seconds.

    Simplified sandbox — see the module docstring's security note.
    """

    def run(self, func: Callable[[], Any], timeout: float) -> ExecutionResult:
        result_q: "queue.Queue[tuple[str, Any]]" = queue.Queue(maxsize=1)

        def target() -> None:
            try:
                result_q.put(("ok", func()))
            except BaseException as exc:  # noqa: BLE001 - report everything back
                result_q.put(("err", exc))

        thread = threading.Thread(target=target, daemon=True, name="lic-exec")
        thread.start()
        thread.join(timeout)
        if thread.is_alive():
            # The thread is abandoned (cannot be force-killed); it will finish
            # or leak. This is the documented limitation of the simple sandbox.
            raise ExecutionTimeout(f"Execution exceeded {timeout:.1f}s")
        kind, payload = result_q.get_nowait()
        if kind == "err":
            # Re-raise the original exception so the caller can classify by type
            # (e.g. tell an unknown entrypoint apart from a bug in owner code).
            raise payload
        return ExecutionResult(payload)


class ProcessExecutor:
    """POSIX-only hardened executor: separate process + hard kill + rlimits.

    Not used by default (Windows dev boxes lack ``resource``/``fork``). Kept as
    a drop-in for production. The callable and its return value must be
    picklable, which holds for the JSON-in/JSON-out entrypoint contract.
    """

    def __init__(self, memory_mb: int | None = 256) -> None:
        self._memory_mb = memory_mb

    def run(self, func: Callable[[], Any], timeout: float) -> ExecutionResult:
        import multiprocessing as mp

        if os.name != "posix":  # pragma: no cover - guarded by caller
            raise RuntimeError("ProcessExecutor requires a POSIX platform")

        ctx = mp.get_context("fork")
        parent_conn, child_conn = ctx.Pipe(duplex=False)
        proc = ctx.Process(
            target=_process_target,
            args=(child_conn, func, self._memory_mb),
            daemon=True,
        )
        proc.start()
        proc.join(timeout)
        if proc.is_alive():
            proc.terminate()
            proc.join(1.0)
            if proc.is_alive():
                proc.kill()
            raise ExecutionTimeout(f"Execution exceeded {timeout:.1f}s")
        if not parent_conn.poll():
            raise ExecutionError("Worker exited without producing a result")
        kind, payload = parent_conn.recv()
        if kind == "err":
            raise ExecutionError(str(payload))
        return ExecutionResult(payload)


def _process_target(conn, func: Callable[[], Any], memory_mb: int | None) -> None:  # pragma: no cover
    try:
        if memory_mb is not None:
            import resource

            limit = memory_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
        conn.send(("ok", func()))
    except BaseException as exc:  # noqa: BLE001
        conn.send(("err", f"{exc.__class__.__name__}: {exc}"))
    finally:
        conn.close()


def default_executor() -> Executor:
    """The executor used by the runtime. Thread-based for portability."""
    return ThreadExecutor()
