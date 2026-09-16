"""Finding and exporting produced media.

`hypit get` is the only supported way to turn a Result Output into a file. It
refuses to overwrite an existing destination, so every download writes to a
fresh, backend-owned path under `HYPIT_EXPORT_DIR`, and the file is streamed back
from there. The Result itself is never modified.

Composite Outputs become directories (`value.json` plus referenced resources).
Those are zipped for transport and served with Hypit's own `value.json` intact,
including its `format` field — the manifest is not rewritten.
"""

from __future__ import annotations

import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from ..config import Settings
from ..deps import get_cli, get_settings, require_token
from ..hypit_cli import HypitCli, HypitError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["outputs"], prefix="/outputs")


@router.get(
    "/{name}/history",
    summary="Every Build that produced this Output",
    dependencies=[Depends(require_token)],
)
async def output_history(
    name: str,
    limit: int = Query(default=20, ge=1, le=200),
    cli: HypitCli = Depends(get_cli),
) -> dict[str, Any]:
    result = await cli.history(name, limit)
    return result.data or {}


@router.get(
    "/{name}/download",
    summary="Export one Output and stream the file",
    dependencies=[Depends(require_token)],
    response_class=FileResponse,
)
async def download_output(
    name: str,
    build: str | None = Query(
        default=None,
        description="Exact build id. Omit to use the newest complete Build that produced this Output.",
    ),
    cli: HypitCli = Depends(get_cli),
    settings: Settings = Depends(get_settings),
):
    build_id = build or await _latest_complete_build(cli, name)
    if not build_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "output_not_found",
                "message": f"No complete Build produced an Output named {name!r}.",
                "hint": "List candidates with GET /api/v1/outputs/{name}/history.",
            },
        )

    safe_name = cli.validate_output_name(name)
    export_root = settings.export_dir / f"{time.strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:8]}"
    destination = export_root / safe_name

    try:
        result = await cli.export_output(build_id, safe_name, destination)
    except HypitError as exc:
        raise _http_from_hypit(exc) from exc

    exported = Path((result.data or {}).get("path") or destination)
    if not exported.exists():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": "export_missing",
                "message": "hypit get reported success but the exported path does not exist.",
                "path": str(exported),
            },
        )

    _prune_exports(settings)

    headers = {
        "X-Hypit-Build": build_id,
        "X-Hypit-Output": safe_name,
        "X-Hypit-Kind": str((result.data or {}).get("kind") or ""),
    }

    if exported.is_dir():
        # Composite output: a directory holding value.json plus its resources.
        archive = exported.with_suffix(exported.suffix + ".zip")
        shutil.make_archive(str(archive.with_suffix("")), "zip", root_dir=exported)
        return FileResponse(archive, media_type="application/zip", filename=f"{safe_name}.zip", headers=headers)

    # Output names are logical (`final.video`), so the exported file carries no
    # useful extension. Sniff the bytes rather than guessing from the name.
    media_type, suffix = _sniff(exported)
    headers["X-Hypit-Media-Type"] = media_type
    return FileResponse(exported, media_type=media_type, filename=f"{safe_name}{suffix}", headers=headers)


@router.get(
    "/{name}/download-probe",
    summary="Resolve which Build a download would use, without exporting",
    dependencies=[Depends(require_token)],
)
async def download_probe(name: str, cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    build_id = await _latest_complete_build(cli, name)
    return {
        "output": cli.validate_output_name(name),
        "buildId": build_id,
        "available": build_id is not None,
    }


async def _latest_complete_build(cli: HypitCli, name: str) -> str | None:
    """Pick the newest Build whose Result carries this Output and completed."""
    try:
        result = await cli.history(name, 50)
    except HypitError:
        return None
    entries = (result.data or {}).get("entries") or []
    for entry in entries:
        if entry.get("outcome") == "complete" and entry.get("build"):
            return str(entry["build"])
    return None


def _sniff(path: Path) -> tuple[str, str]:
    """Identify the exported bytes so the download is served usefully.

    Output names are logical (`final.video`, `presenter.image`), so the file on
    disk has no reliable extension. The first 16 bytes decide the media type and
    the extension offered in `Content-Disposition`.
    """
    try:
        with path.open("rb") as handle:
            head = handle.read(16)
    except OSError:
        return "application/octet-stream", ""

    if len(head) >= 12 and head[4:8] == b"ftyp":
        return "video/mp4", ".mp4"
    if head.startswith(b"\x1aE\xdf\xa3"):
        return "video/webm", ".webm"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", ".webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav", ".wav"
    if head.startswith(b"OggS"):
        return "audio/ogg", ".ogg"
    if head.startswith(b"fLaC"):
        return "audio/flac", ".flac"
    if head.startswith(b"ID3") or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg", ".mp3"
    if head.startswith(b"PK\x03\x04"):
        return "application/zip", ".zip"
    if head[:1] in (b"{", b"[") or head.startswith(b"<?xml"):
        return "application/json", ".json"
    if head[:4] == bytes((0x30, 0x26, 0xB2, 0x75)):  # ASF/WMV
        return "video/x-ms-wmv", ".wmv"

    fallback = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".srt": "application/x-subrip",
        ".vtt": "text/vtt",
        ".txt": "text/plain",
    }.get(path.suffix.lower())
    if fallback:
        return fallback, path.suffix.lower()
    return "application/octet-stream", path.suffix if path.suffix else ""


def _prune_exports(settings: Settings) -> None:
    cutoff = time.time() - settings.export_ttl_seconds
    try:
        for child in settings.export_dir.iterdir():
            if child.stat().st_mtime < cutoff:
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    child.unlink(missing_ok=True)
    except OSError:  # pragma: no cover - housekeeping must never fail a download
        logger.debug("export pruning skipped", exc_info=True)


def _http_from_hypit(exc: HypitError) -> HTTPException:
    detail = exc.as_detail()
    if exc.code in {"ENOENT", "CLI_USAGE"}:
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)
