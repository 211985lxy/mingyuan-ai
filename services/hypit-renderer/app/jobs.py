"""Background submission queue.

`hypit build` returns after a durable submission, but the submission still does a
preflight, may start a stopped Worker and talks to the Runtime, so it can take
seconds. The HTTP request must not depend on that: the request only enqueues,
and this module owns the call.

Shape of the lifecycle:

    queued  -> submitting -> submitted(buildId) | failed(error)
    queued  -> cancelled

Only `hypit build` (without `--follow`) is used here. Execution stays with the
Runtime Worker, so a restart of this API process cannot lose a running Build: the
Build's own state lives in the project Result repository and is read back with
`GET /api/v1/builds`, `GET /api/v1/builds/{id}` and `hypit activity`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Settings
from .hypit_cli import HypitCli, HypitError, SourceRef
from .security import redact

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class JobRecord:
    job_id: str
    state: str
    source: str
    source_kind: str
    title: str | None
    created_at: str
    updated_at: str
    build_id: str | None = None
    error: dict[str, Any] | None = None
    note: str | None = None
    attempts: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class JobManager:
    """Single-process queue with file-backed state."""

    def __init__(self, settings: Settings, cli: HypitCli) -> None:
        self.settings = settings
        self.cli = cli
        self._jobs: dict[str, JobRecord] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._waiters: dict[str, asyncio.Event] = {}
        self._workers: list[asyncio.Task[None]] = []
        self._lock = asyncio.Lock()
        self._closing = False

    # ----------------------------------------------------------- lifecycle

    async def start(self) -> None:
        self._load()
        self._closing = False
        for index in range(max(1, self.settings.max_concurrent_submissions)):
            self._workers.append(asyncio.create_task(self._worker(index), name=f"hypit-submit-{index}"))
        # Anything left mid-submission by a previous process is reconciled
        # against Hypit's own build list, which is the authoritative record.
        await self._reconcile_orphans()

    async def stop(self) -> None:
        self._closing = True
        for task in self._workers:
            task.cancel()
        for task in self._workers:
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001 - shutdown best effort
                pass
        self._workers.clear()
        self._persist()

    # ------------------------------------------------------------- public

    async def enqueue(self, source: SourceRef, title: str | None) -> JobRecord:
        async with self._lock:
            record = JobRecord(
                job_id=f"job_{uuid.uuid4().hex[:16]}",
                state="queued",
                source=str(source.path),
                source_kind=source.kind,
                title=title,
                created_at=_now(),
                updated_at=_now(),
            )
            self._jobs[record.job_id] = record
            self._persist()
        await self._queue.put(record.job_id)
        return record

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    def recent(self, limit: int) -> list[JobRecord]:
        ordered = sorted(self._jobs.values(), key=lambda item: item.created_at, reverse=True)
        return ordered[: max(1, min(limit, 500))]

    def queue_depth(self) -> int:
        return self._queue.qsize()

    async def wait_for_outcome(self, job_id: str, timeout: float) -> JobRecord | None:
        """Block until the job leaves queued/submitting, or the timeout passes."""
        record = self._jobs.get(job_id)
        if record is None:
            return None
        if record.state in {"submitted", "failed", "cancelled"}:
            return record
        event = self._waiters.setdefault(job_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass
        return self._jobs.get(job_id)

    async def cancel(self, job_id: str, reason: str | None) -> dict[str, Any]:
        """Cancel a queued job, or withdraw an already submitted Build."""
        record = self._jobs.get(job_id)
        if record is None:
            return {"error": "not_found", "message": f"Unknown jobId: {job_id}"}
        if record.state == "queued":
            async with self._lock:
                record.state = "cancelled"
                record.note = reason or "cancelled before submission"
                record.updated_at = _now()
                self._persist()
            self._signal(job_id)
            return {"jobId": job_id, "state": record.state, "buildId": None, "requested": True}
        if record.state == "submitting":
            record.note = reason or "cancellation requested while submitting; the Build may still be created"
            record.updated_at = _now()
            self._persist()
            return {"jobId": job_id, "state": record.state, "buildId": None, "requested": False, "note": record.note}
        if record.state == "submitted" and record.build_id:
            result = await self.cli.cancel(record.build_id, reason)
            return {
                "jobId": job_id,
                "state": record.state,
                "buildId": record.build_id,
                "requested": bool((result.data or {}).get("requested")),
                "hypit": result.data,
            }
        return {
            "jobId": job_id,
            "state": record.state,
            "buildId": record.build_id,
            "requested": False,
            "note": record.note or "nothing left to cancel",
        }

    # ------------------------------------------------------------- worker

    async def _worker(self, index: int) -> None:
        while not self._closing:
            job_id = await self._queue.get()
            try:
                await self._process(job_id)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - a worker must survive any single failure
                logger.exception("submission worker %d failed on %s", index, job_id)
            finally:
                self._queue.task_done()

    async def _process(self, job_id: str) -> None:
        record = self._jobs.get(job_id)
        if record is None or record.state != "queued":
            return

        record.state = "submitting"
        record.attempts += 1
        record.updated_at = _now()
        self._persist()

        source = SourceRef(path=Path(record.source), kind=record.source_kind, original=record.source)
        try:
            result = await self.cli.submit_build(source, record.title)
        except HypitError as exc:
            record.state = "failed"
            record.error = exc.as_detail()
            record.updated_at = _now()
            self._persist()
            self._signal(job_id)
            logger.warning("submission %s failed: %s", job_id, redact(str(exc), self.settings))
            return
        except Exception as exc:  # noqa: BLE001
            record.state = "failed"
            record.error = {"error": "backend_error", "message": str(exc)}
            record.updated_at = _now()
            self._persist()
            self._signal(job_id)
            logger.exception("submission %s crashed", job_id)
            return

        build_id = ((result.data or {}).get("build") or {}).get("id")
        if not build_id:
            record.state = "failed"
            record.error = {
                "error": "missing_build_id",
                "message": "hypit build returned no build id.",
                "stdout": redact(result.stdout[-2000:], self.settings),
                "stderr": redact(result.stderr[-2000:], self.settings),
            }
            record.updated_at = _now()
            self._persist()
            self._signal(job_id)
            return

        record.build_id = str(build_id)
        record.state = "submitted"
        record.updated_at = _now()
        self._persist()
        self._signal(job_id)
        logger.info("submission %s -> build %s", job_id, record.build_id)

    def _signal(self, job_id: str) -> None:
        event = self._waiters.pop(job_id, None)
        if event is not None:
            event.set()

    # ------------------------------------------------------------- state

    def _load(self) -> None:
        path = self.settings.jobs_file
        if not path.is_file():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("ignoring unreadable job state at %s", path)
            return
        for raw in payload.get("jobs", []):
            try:
                record = JobRecord(**raw)
            except TypeError:
                continue
            self._jobs[record.job_id] = record

    def _persist(self) -> None:
        path = self.settings.jobs_file
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"format": "hypit-backend.jobs@1", "jobs": [job.to_dict() for job in self._jobs.values()]}
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

    async def _reconcile_orphans(self) -> None:
        """Adopt Builds that a previous process submitted but never recorded.

        Hypit owns the truth: a Worker keeps executing after this API process
        dies. We match by Run name plus submission time, and only ever adopt a
        Build that no other job already claims.
        """
        orphans = [job for job in self._jobs.values() if job.state == "submitting"]
        if not orphans:
            return
        try:
            result = await self.cli.list_builds()
        except HypitError as exc:
            logger.warning("could not reconcile orphan submissions: %s", exc)
            for job in orphans:
                job.state = "unknown"
                job.note = "API process restarted during submission; check GET /api/v1/builds"
                job.updated_at = _now()
            self._persist()
            return

        builds = (result.data or {}).get("builds") or []
        claimed = {job.build_id for job in self._jobs.values() if job.build_id}
        for job in orphans:
            run_name = Path(job.source).name
            started = job.updated_at
            candidates = [
                build
                for build in builds
                if build.get("run") == run_name
                and str(build.get("createdAt") or "") >= started
                and build.get("id") not in claimed
            ]
            if candidates:
                chosen = sorted(candidates, key=lambda item: str(item.get("createdAt") or ""))[0]
                job.build_id = str(chosen.get("id"))
                job.state = "submitted"
                job.note = "recovered after restart by matching the project build list"
                claimed.add(job.build_id)
            else:
                job.state = "unknown"
                job.note = "API process restarted during submission; no matching Build was found."
            job.updated_at = _now()
        self._persist()
