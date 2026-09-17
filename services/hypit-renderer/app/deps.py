"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import Depends, Request

from .config import Settings
from .hypit_cli import HypitCli
from .jobs import JobManager
from .security import require_token


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_cli(request: Request) -> HypitCli:
    return request.app.state.cli


def get_jobs(request: Request) -> JobManager:
    return request.app.state.jobs


__all__ = ["get_cli", "get_jobs", "get_settings", "require_token", "Depends"]
