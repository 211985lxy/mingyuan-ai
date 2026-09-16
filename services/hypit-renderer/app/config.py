"""Configuration for the Hypit HTTP backend.

Every value comes from the environment so that no credential, path or token is
hard-coded in a committed file. See `.env.example` for the full surface.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if raw == "":
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = _env(name)
    if raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_path(name: str, default: Path) -> Path:
    raw = _env(name)
    return Path(raw).expanduser().resolve() if raw else default.resolve()


@dataclass(frozen=True)
class Settings:
    # --- Hypit executable and project -------------------------------------
    # The CLI is invoked as an argument array (never through a shell). The
    # default is the launcher from the Hypit checkout rather than the globally
    # installed npm package: release 0.1.8 on npm still carries `workspace:*`
    # dependencies, so a Worker started from that tree cannot resolve
    # `@hypit/hyperframes` / `@hyperframes/engine` and every local render fails
    # at its cleanup step. See docs/ACCEPTANCE.md for the recorded evidence.
    hypit_bin: Path = field(default_factory=lambda: _env_path("HYPIT_BIN", Path("/Users/xiangyu/.npm-global/bin/hypit")))
    hypit_cwd: Path = field(
        default_factory=lambda: _env_path("HYPIT_CWD", Path("/Users/xiangyu/Doubao/skills/hypit-repo"))
    )
    # `hypit` resolves the project from the nearest package.json above the
    # working directory. A source that lives outside that project is rejected
    # ("Source ... is outside workspace root ..."), so out-of-tree projects must
    # be named explicitly here.
    hypit_workspace: Path | None = field(
        default_factory=lambda: (_env_path("HYPIT_WORKSPACE", Path("")) if _env("HYPIT_WORKSPACE") else None)
    )
    hypit_runtime_profile: Path | None = field(
        default_factory=lambda: (
            _env_path("HYPIT_RUNTIME_PROFILE", Path("")) if _env("HYPIT_RUNTIME_PROFILE") else None
        )
    )
    hypit_package_root: Path | None = field(
        default_factory=lambda: (
            _env_path("HYPIT_PACKAGE_ROOT", Path("")) if _env("HYPIT_PACKAGE_ROOT") else None
        )
    )

    # --- macOS 26 `ps` workaround -----------------------------------------
    # See tools/ps-shim/ps.c. When enabled, `bin/` is prepended to PATH for every
    # Hypit child process, so the local renderer's process-tree cleanup works.
    ps_shim_enabled: bool = field(default_factory=lambda: _env_bool("HYPIT_PS_SHIM", True))
    ps_shim_dir: Path = field(default_factory=lambda: _env_path("HYPIT_PS_SHIM_DIR", PROJECT_ROOT / "bin"))

    # --- Worker warm-up ---------------------------------------------------
    # The Build Worker spawns on the first `hypit build`. Under an orchestrator
    # that deadlocks readiness: /health reports ok=False while the Worker is
    # stopped, so the pod never becomes ready and never receives that first
    # build. Starting it during the lifespan handshake breaks the cycle.
    runtime_warmup: bool = field(default_factory=lambda: _env_bool("HYPIT_RUNTIME_WARMUP", True))
    runtime_warmup_timeout_seconds: float = field(
        default_factory=lambda: _env_float("HYPIT_RUNTIME_WARMUP_TIMEOUT_SECONDS", 60.0)
    )

    # --- Auth -------------------------------------------------------------
    # No default: the process refuses to start without a token.
    api_token: str = field(default_factory=lambda: _env("HYPIT_API_TOKEN"))
    api_token_header: str = field(default_factory=lambda: _env("HYPIT_API_TOKEN_HEADER", "X-API-Token"))

    # --- Request handling -------------------------------------------------
    # A submitted build only needs the CLI's cheap preflight + durable
    # submission, which normally returns in a few seconds without --follow.
    # POST /builds waits at most this long for the build id; beyond that it
    # answers 202 and the client polls the job. The worker keeps running either
    # way, so the request never blocks on execution.
    submit_block_seconds: float = field(default_factory=lambda: float(_env("HYPIT_SUBMIT_BLOCK_SECONDS", "15")))
    submit_timeout_seconds: float = field(default_factory=lambda: float(_env("HYPIT_SUBMIT_TIMEOUT_SECONDS", "300")))
    query_timeout_seconds: float = field(default_factory=lambda: float(_env("HYPIT_QUERY_TIMEOUT_SECONDS", "120")))
    plan_timeout_seconds: float = field(default_factory=lambda: float(_env("HYPIT_PLAN_TIMEOUT_SECONDS", "300")))
    download_timeout_seconds: float = field(default_factory=lambda: float(_env("HYPIT_DOWNLOAD_TIMEOUT_SECONDS", "600")))
    max_concurrent_submissions: int = field(default_factory=lambda: _env_int("HYPIT_MAX_CONCURRENT_SUBMISSIONS", 2))

    # --- Sources ----------------------------------------------------------
    # Extra roots a `source` path may resolve inside. The workspace is always
    # allowed; `--workspace` also grants read access under it.
    allowed_source_roots: tuple[Path, ...] = field(default_factory=lambda: _parse_roots())
    allowed_source_suffixes: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            s.strip() for s in _env("HYPIT_ALLOWED_SOURCE_SUFFIXES", ".svml,.svs,.svrun").split(",") if s.strip()
        )
    )
    upload_dir: Path | None = field(
        default_factory=lambda: (_env_path("HYPIT_UPLOAD_DIR", Path("")) if _env("HYPIT_UPLOAD_DIR") else None)
    )
    max_source_bytes: int = field(default_factory=lambda: _env_int("HYPIT_MAX_SOURCE_BYTES", 2 * 1024 * 1024))

    # --- Exports ----------------------------------------------------------
    export_dir: Path = field(default_factory=lambda: _env_path("HYPIT_EXPORT_DIR", PROJECT_ROOT / "outputs"))
    export_ttl_seconds: int = field(default_factory=lambda: _env_int("HYPIT_EXPORT_TTL_SECONDS", 86400))

    # --- State ------------------------------------------------------------
    state_dir: Path = field(default_factory=lambda: _env_path("HYPIT_STATE_DIR", PROJECT_ROOT / "state"))
    log_level: str = field(default_factory=lambda: _env("HYPIT_LOG_LEVEL", "INFO").upper() or "INFO")

    @property
    def jobs_file(self) -> Path:
        return self.state_dir / "jobs.json"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.api_token)


def _parse_roots() -> tuple[Path, ...]:
    raw = _env("HYPIT_ALLOWED_SOURCE_ROOTS")
    roots: list[Path] = []
    if raw:
        roots.extend(Path(p).expanduser().resolve() for p in raw.split(":") if p.strip())
    workspace = _env("HYPIT_WORKSPACE")
    if workspace:
        roots.append(Path(workspace).expanduser().resolve())
    cwd = _env("HYPIT_CWD", "/opt/hypit")
    roots.append(Path(cwd).expanduser().resolve())
    seen: list[Path] = []
    for root in roots:
        if root not in seen:
            seen.append(root)
    return tuple(seen)


def load_settings() -> Settings:
    settings = Settings()
    # Only the export dir is created eagerly; everything else is expected to
    # already exist and is reported by /health instead of being created here.
    settings.export_dir.mkdir(parents=True, exist_ok=True)
    settings.state_dir.mkdir(parents=True, exist_ok=True)
    return settings
