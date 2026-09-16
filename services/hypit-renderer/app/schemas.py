"""Request schemas. Field names mirror the `hypit` vocabulary (source, build,
run, output) so callers can move between the HTTP API and the CLI without
translating concepts."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class BuildRequest(BaseModel):
    source: str | None = Field(
        default=None,
        description=(
            "Path to a .svml / .svs / .svrun source. Relative paths resolve against HYPIT_WORKSPACE. "
            "Must resolve inside an allowed root."
        ),
    )
    content: str | None = Field(
        default=None,
        description="Inline source text, written to the workspace before submission. Use instead of `source`.",
    )
    filename: str | None = Field(
        default=None,
        description="File name for `content`; its extension selects the source kind. Defaults to inline.svml.",
    )
    title: str | None = Field(default=None, max_length=160, description="Human-facing Result title.")
    wait_seconds: float | None = Field(
        default=None,
        ge=0,
        le=120,
        description=(
            "How long this request may wait for the build id before answering 202. "
            "Defaults to the server's HYPIT_SUBMIT_BLOCK_SECONDS."
        ),
    )

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "BuildRequest":
        if bool(self.source) == bool(self.content):
            raise ValueError("Provide exactly one of `source` or `content`.")
        return self


class PlanRequest(BaseModel):
    source: str | None = None
    content: str | None = None
    filename: str | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "PlanRequest":
        if bool(self.source) == bool(self.content):
            raise ValueError("Provide exactly one of `source` or `content`.")
        return self


class CheckRequest(BaseModel):
    source: str | None = None
    content: str | None = None
    filename: str | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> "CheckRequest":
        if bool(self.source) == bool(self.content):
            raise ValueError("Provide exactly one of `source` or `content`.")
        return self


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=400)


class JobEnvelope(BaseModel):
    jobId: str
    state: str
    buildId: str | None = None
    source: str
    title: str | None = None
    createdAt: str
    updatedAt: str
    error: dict[str, Any] | None = None
    note: str | None = None
