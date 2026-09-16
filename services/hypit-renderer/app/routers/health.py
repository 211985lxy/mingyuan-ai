"""GET /api/v1/health — is the rendering engine actually usable right now?

`hypit doctor` answers "is this deployment configured", `hypit runtime status`
answers "is the Worker up and how much work is in flight". Both are read-only and
cost nothing. This endpoint merges them into one answer instead of making the
caller understand two schemas.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from ..config import Settings
from ..deps import get_cli, get_jobs, get_settings, require_token
from ..hypit_cli import HypitCli, HypitError
from ..jobs import JobManager

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    summary="Component health for the Hypit rendering backend",
    dependencies=[Depends(require_token)],
)
async def health(
    cli: HypitCli = Depends(get_cli),
    jobs: JobManager = Depends(get_jobs),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    doctor_task = asyncio.create_task(cli.doctor())
    status_task = asyncio.create_task(cli.runtime_status())
    doctor, status = await asyncio.gather(doctor_task, status_task, return_exceptions=True)

    body: dict[str, Any] = {
        "format": "hypit-backend.health@1",
        "backend": cli.environment_report(),
        "warnings": cli.warnings(),
        "queue": {"depth": jobs.queue_depth()},
    }

    body["doctor"] = _summarize_doctor(doctor)
    body["runtime"] = _summarize_runtime(status)
    body["ok"] = bool(body["doctor"].get("ok") and body["runtime"].get("workerOnline"))
    return body


def _summarize_doctor(result: Any) -> dict[str, Any]:
    if isinstance(result, BaseException):
        return {
            "ok": False,
            "error": result.as_detail() if isinstance(result, HypitError) else {"message": str(result)},
        }
    data = result.data or {}
    diagnostics = data.get("diagnostics") or []
    return {
        "ok": bool(data.get("ok")),
        "project": data.get("project"),
        "profile": data.get("profile"),
        "profileSource": data.get("profileSource"),
        "diagnosticCount": data.get("diagnosticCount", len(diagnostics)),
        "diagnostics": diagnostics,
    }


def _summarize_runtime(result: Any) -> dict[str, Any]:
    if isinstance(result, BaseException):
        return {
            "workerOnline": False,
            "error": result.as_detail() if isinstance(result, HypitError) else {"message": str(result)},
        }
    data = result.data or {}
    worker = data.get("worker") or {}
    programs = data.get("programs") or {}
    builds = data.get("builds") or {}
    capacity = data.get("capacity") or {}
    return {
        "ready": bool(data.get("ready")),
        "attention": bool(data.get("attention")),
        "workerOnline": worker.get("state") == "running",
        "worker": worker,
        "programs": programs,
        "buildsInFlight": builds,
        "capacity": capacity,
    }
