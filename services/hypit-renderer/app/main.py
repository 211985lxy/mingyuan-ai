"""Hypit rendering backend — FastAPI application.

Scope and licence boundary (read `app/hypit_cli.py` for the full note):
this service is a single-tenant rendering backend for the operator's own
application. It deliberately offers no tenant isolation and no resale path,
because the Hypit licence permits the former use and forbids the latter.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .hypit_cli import HypitCli, HypitError, SourceError
from .jobs import JobManager
from .routers import builds, health, outputs, preview
from .security import redact

logger = logging.getLogger("hypit_backend")

API_PREFIX = "/api/v1"


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    # Uvicorn's access log prints the full path and query. Tokens arrive in
    # headers, but a `source` query string can carry a filesystem layout we would
    # rather not persist, so the access log is turned down to warnings.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = load_settings()
    configure_logging(settings.log_level)

    cli = HypitCli(settings)
    jobs = JobManager(settings, cli)
    app.state.settings = settings
    app.state.cli = cli
    app.state.jobs = jobs

    for note in cli.warnings():
        logger.warning("config: %s", note)
    logger.info("hypit backend starting: bin=%s cwd=%s", settings.hypit_bin, settings.hypit_cwd)

    await jobs.start()
    warmup = asyncio.create_task(_warm_up_worker(cli, settings))
    try:
        yield
    finally:
        warmup.cancel()
        await jobs.stop()
        logger.info("hypit backend stopped")


async def _warm_up_worker(cli: HypitCli, settings: Settings) -> None:
    """Start the Build Worker before the first request instead of during it.

    The Worker is lazy: it is spawned by the first `hypit build`. Left alone that
    creates a readiness deadlock under an orchestrator — `/health` reports
    `ok: false` while the Worker is stopped, so the pod never becomes ready,
    never receives a Build, and the Worker therefore never starts.

    A failed warm-up is logged and otherwise ignored: every submit path still
    spawns the Worker on demand, so the service degrades to slow first request
    rather than to broken.
    """
    if not settings.runtime_warmup:
        logger.info("runtime warm-up disabled (HYPIT_RUNTIME_WARMUP=0)")
        return
    try:
        await asyncio.wait_for(cli.runtime_up(), timeout=settings.runtime_warmup_timeout_seconds)
        logger.info("runtime Worker started during warm-up")
    except asyncio.TimeoutError:
        logger.warning(
            "runtime warm-up timed out after %ss; the Worker will start on first build",
            settings.runtime_warmup_timeout_seconds,
        )
    except HypitError as exc:
        logger.warning("runtime warm-up failed: %s", exc.as_detail().get("message"))
    except Exception as exc:  # noqa: BLE001 - warm-up must never block startup
        logger.warning("runtime warm-up raised %s: %s", type(exc).__name__, exc)


app = FastAPI(
    title="Hypit Rendering Backend",
    version="1.0.0",
    description=(
        "Single-tenant HTTP wrapper around the locally installed `hypit` CLI "
        "(@hypit/hypit 0.1.8). Submit Builds asynchronously, poll their state, read their "
        "execution logs and export produced media.\n\n"
        "Licence: Hypit is used under its modified Apache-2.0 terms — as a rendering backend "
        "for the operator's own application. Multi-tenant operation and commercial "
        "redistribution require a separate written licence from Hypit.AI. Production output "
        "belongs to the operator; the Hypit name, LOGO and copyright notices in CLI output, "
        "run reports and manifests are preserved verbatim by this API."
    ),
    lifespan=lifespan,
    openapi_url=f"{API_PREFIX}/openapi.json",
    docs_url=f"{API_PREFIX}/docs",
    redoc_url=None,
)

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(builds.router, prefix=API_PREFIX)
app.include_router(outputs.router, prefix=API_PREFIX)
app.include_router(preview.router, prefix=API_PREFIX)


@app.exception_handler(HypitError)
async def hypit_error_handler(request: Request, exc: HypitError) -> JSONResponse:
    """One structured shape for every engine failure, stderr included.

    The `stderr` field is Hypit's own output and is passed through unchanged so a
    caller can see the real Provider or compiler message rather than our summary
    of it.
    """
    settings: Settings = request.app.state.settings
    detail = exc.as_detail()
    detail["stderr"] = redact(detail.get("stderr", ""), settings)
    # Hypit raises CLI_ERROR / CLI_USAGE / ENOENT before any external work: a bad
    # graph, an unresolvable import, a missing file. Those are the caller's input,
    # so they are 400. Anything else that arrives as an exception is the engine
    # itself failing, which is 502.
    status_code = 400 if exc.code in {"CLI_USAGE", "CLI_ERROR", "ENOENT", "EEXIST"} else 502
    logger.warning("engine failure on %s: %s", request.url.path, detail.get("message"))
    return JSONResponse(status_code=status_code, content=detail)


@app.exception_handler(SourceError)
async def source_error_handler(request: Request, exc: SourceError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "invalid_source", "message": str(exc)},
    )


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {
        "service": "hypit-rendering-backend",
        "api": API_PREFIX,
        "docs": f"{API_PREFIX}/docs",
        "health": f"{API_PREFIX}/health",
    }


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HYPIT_HOST", "127.0.0.1"),
        port=int(os.environ.get("HYPIT_PORT", "8787")),
        reload=False,
    )
