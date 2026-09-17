"""Build submission, polling, logs, cancellation, and the submission jobs.

Nothing here blocks on execution. `POST /builds` enqueues; the Worker owns the
Build from durable submission onward, so a client that disconnects (or an API
process that dies) does not stop the render.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from ..config import Settings
from ..deps import get_cli, get_jobs, get_settings, require_token
from ..hypit_cli import HypitCli, SourceError, SourceRef
from ..jobs import JobManager
from ..schemas import BuildRequest, CancelRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["builds"])


def _resolve(cli: HypitCli, source: str | None, content: str | None, filename: str | None) -> SourceRef:
    if source:
        return cli.resolve_source(source)
    assert content is not None
    return cli.write_source(content, filename or "inline.svml")


def _job_envelope(job: Any) -> dict[str, Any]:
    return {
        "jobId": job.job_id,
        "state": job.state,
        "buildId": job.build_id,
        "source": job.source,
        "title": job.title,
        "createdAt": job.created_at,
        "updatedAt": job.updated_at,
        "error": job.error,
        "note": job.note,
    }


@router.post(
    "/builds",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a Build (asynchronous)",
    dependencies=[Depends(require_token)],
    responses={
        201: {"description": "Build accepted and its id is known (job state `submitted`)."},
        202: {"description": "Queued, but the build id is not known yet; poll the job."},
        400: {"description": "Invalid or out-of-root source."},
    },
)
async def create_build(
    payload: BuildRequest,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
    cli: HypitCli = Depends(get_cli),
    jobs: JobManager = Depends(get_jobs),
) -> dict[str, Any]:
    """Enqueue `hypit build <source> --json` (never `--follow`).

    The request waits at most `wait_seconds` (default `HYPIT_SUBMIT_BLOCK_SECONDS`)
    for the build id. That window only covers the CLI's cheap preflight and
    durable submission — not rendering. If it closes first, the answer is 202 and
    the client polls `GET /api/v1/jobs/{jobId}`; the submission keeps going.
    """
    source = _resolve(cli, payload.source, payload.content, payload.filename)
    job = await jobs.enqueue(source, payload.title)
    wait_for = payload.wait_seconds if payload.wait_seconds is not None else settings.submit_block_seconds

    settled = await jobs.wait_for_outcome(job.job_id, wait_for) if wait_for > 0 else job
    settled = settled or job

    body = _job_envelope(settled)
    body["pollUrl"] = f"/api/v1/jobs/{settled.job_id}"
    body["buildUrl"] = f"/api/v1/builds/{settled.build_id}" if settled.build_id else None

    if settled.state == "failed":
        response.status_code = status.HTTP_400_BAD_REQUEST
    elif settled.build_id is None:
        response.status_code = status.HTTP_202_ACCEPTED
    return body


# --------------------------------------------------------------- jobs


@router.get(
    "/jobs",
    summary="Recent submission jobs known to this process",
    dependencies=[Depends(require_token)],
)
async def list_jobs(
    limit: int = Query(default=50, ge=1, le=500),
    jobs: JobManager = Depends(get_jobs),
) -> dict[str, Any]:
    return {
        "format": "hypit-backend.jobs@1",
        "jobs": [_job_envelope(job) for job in jobs.recent(limit)],
    }


@router.get(
    "/jobs/{job_id}",
    summary="One submission job",
    dependencies=[Depends(require_token)],
)
async def get_job(job_id: str, jobs: JobManager = Depends(get_jobs)) -> dict[str, Any]:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": f"Unknown jobId: {job_id}"},
        )
    return _job_envelope(job)


@router.post(
    "/jobs/{job_id}/cancel",
    summary="Cancel a queued submission, or withdraw its Build",
    dependencies=[Depends(require_token)],
)
async def cancel_job(
    job_id: str,
    payload: CancelRequest | None = None,
    jobs: JobManager = Depends(get_jobs),
) -> dict[str, Any]:
    return await jobs.cancel(job_id, (payload.reason if payload else None))


# ------------------------------------------------------------- builds


@router.get(
    "/builds",
    summary="Project Results, newest first",
    dependencies=[Depends(require_token)],
)
async def list_builds(cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    result = await cli.list_builds()
    return result.data or {}


@router.get(
    "/builds/{build_id}",
    summary="One Build's current work and Result facts",
    dependencies=[Depends(require_token)],
)
async def get_build(build_id: str, cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    result = await cli.build_status(build_id)
    return result.data or {}


@router.get(
    "/builds/{build_id}/inspect",
    summary="Result targets, outputs and outcome",
    dependencies=[Depends(require_token)],
)
async def inspect_build(build_id: str, cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    result = await cli.inspect(build_id)
    return result.data or {}


@router.get(
    "/builds/{build_id}/logs",
    summary="Saved Build execution records",
    dependencies=[Depends(require_token)],
)
async def build_logs(
    build_id: str,
    lines: int = Query(default=100, ge=1, le=5000, description="Read the last N records."),
    cli: HypitCli = Depends(get_cli),
) -> dict[str, Any]:
    result = await cli.logs(build_id, lines)
    if result.data is not None:
        return result.data
    # `logs` can answer in text when no JSON document applies; keep it verbatim.
    return {
        "format": "hypit.cli-logs@1",
        "build": build_id,
        "text": result.stdout,
        "stderr": result.stderr,
    }


@router.post(
    "/builds/{build_id}/cancel",
    summary="Withdraw one active Build",
    dependencies=[Depends(require_token)],
)
async def cancel_build(
    build_id: str,
    payload: CancelRequest | None = None,
    cli: HypitCli = Depends(get_cli),
) -> dict[str, Any]:
    """Best effort, exactly as Hypit describes it: work that has not started is
    withdrawn, an already submitted Provider operation is asked once to cancel,
    and accepted output is retained."""
    result = await cli.cancel(build_id, payload.reason if payload else None)
    return result.data or {}


@router.get(
    "/activity",
    summary="Active Builds and shared Provider capacity",
    dependencies=[Depends(require_token)],
)
async def activity(cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    result = await cli.activity()
    return result.data or {}


__all__ = ["router", "SourceError"]
