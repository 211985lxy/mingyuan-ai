"""Read-only preview endpoints: what would run, is the source valid, what would
it cost.

All three are local or read-only-network operations that start no Build and
submit no generation, which is exactly why the front end can call them freely
before a user authorizes paid work.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ..deps import get_cli, require_token
from ..hypit_cli import HypitCli
from ..schemas import CheckRequest, PlanRequest

router = APIRouter(tags=["preview"])


@router.post(
    "/plans",
    summary="Show the work a Run would execute, without executing it",
    dependencies=[Depends(require_token)],
)
async def create_plan(payload: PlanRequest, cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    source = _resolve(cli, payload.source, payload.content, payload.filename)
    result = await cli.plan(source)
    return result.data or {}


@router.post(
    "/checks",
    summary="Validate one Author or Run source",
    dependencies=[Depends(require_token)],
)
async def create_check(payload: CheckRequest, cli: HypitCli = Depends(get_cli)) -> dict[str, Any]:
    source = _resolve(cli, payload.source, payload.content, payload.filename)
    result = await cli.check(source)
    return result.data or {}


@router.get(
    "/pricing",
    summary="Selected Providers' current pricing material for a Run",
    dependencies=[Depends(require_token)],
)
async def get_pricing(
    source: str = Query(description="Run source path, resolved inside an allowed root."),
    cli: HypitCli = Depends(get_cli),
) -> dict[str, Any]:
    resolved = cli.resolve_source(source)
    result = await cli.pricing(resolved)
    return result.data or {}


def _resolve(cli: HypitCli, source: str | None, content: str | None, filename: str | None):
    if source:
        return cli.resolve_source(source)
    assert content is not None
    return cli.write_source(content, filename or "inline.svml")
