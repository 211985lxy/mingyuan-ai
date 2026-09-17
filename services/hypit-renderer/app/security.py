"""API-token authentication.

Internal service or not, the process must not answer unauthenticated calls:
anything on the same network could otherwise spend Provider credit through
`POST /api/v1/builds`.

Two accepted forms:
    X-API-Token: <token>            (header name from HYPIT_API_TOKEN_HEADER)
    Authorization: Bearer <token>

The token is read from the environment only. It is never written to disk, never
returned by an endpoint and never logged: see `redact()`.
"""

from __future__ import annotations

import hmac
import logging
import os
from typing import Annotated

from fastapi import Header, HTTPException, Request, status
from fastapi.security import APIKeyHeader

from .config import Settings

logger = logging.getLogger(__name__)

# Declared as a FastAPI security scheme so /docs shows an Authorize button and
# the OpenAPI document names the credential. The name is read at import time
# because route signatures are built once, at import.
TOKEN_HEADER_NAME = os.environ.get("HYPIT_API_TOKEN_HEADER", "X-API-Token").strip() or "X-API-Token"
api_key_scheme = APIKeyHeader(name=TOKEN_HEADER_NAME, auto_error=False, scheme_name="HypitApiToken")


def redact(text: str, settings: Settings) -> str:
    """Remove anything that must never reach a log line."""
    if not text:
        return text
    if settings.api_token:
        text = text.replace(settings.api_token, "***REDACTED***")
    # Provider keys sometimes leak into CLI stderr banners; keep the usual
    # shapes out of our own logs as well.
    for marker in ("Authorization:", "authorization:", f"{TOKEN_HEADER_NAME}:", "api_key=", "apikey="):
        if marker in text:
            head, _, tail = text.partition(marker)
            remainder = tail[tail.index(" ") :] if " " in tail else ""
            text = f"{head}{marker} ***REDACTED***{remainder}"
    return text


async def require_token(
    request: Request,
    x_api_token: Annotated[str | None, Header(alias=TOKEN_HEADER_NAME)] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """FastAPI dependency enforcing the shared token.

    `Settings` is read from `request.app.state` rather than declared as a
    parameter: a bare annotated argument with no `Depends` would otherwise be
    interpreted by FastAPI as a required request-body field.
    """
    settings: Settings = request.app.state.settings
    if not settings.auth_enabled:
        # Fail closed: a missing token is a deployment mistake, not a licence to
        # serve unauthenticated callers.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "not_configured", "message": "HYPIT_API_TOKEN is unset; refusing all requests."},
        )

    presented = _extract_token(x_api_token, authorization)
    if not presented or not hmac.compare_digest(presented, settings.api_token):
        logger.warning("unauthorized request to %s", request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "Missing or invalid API token."},
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_token(header_value: str | None, authorization: str | None) -> str | None:
    if header_value:
        return header_value.strip()
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
    return None
