"""Thin, typed wrapper around the `hypit` executable.

LICENSING — READ BEFORE CHANGING THIS FILE
------------------------------------------
Hypit ships under a *modified* Apache-2.0 licence (see the LICENSE file in the
Hypit repository). Clause 1 permits commercial use **for your own
organization's purposes**, explicitly including "as a rendering or generation
backend for applications your organization operates for itself". That is exactly
what this backend does.

The same clause forbids, unless Hypit.AI authorizes it in writing:

  (a) multi-tenant operation — running one Hypit environment in which two or
      more parties *outside your own organization* hold separate workspaces,
      whether or not a fee is charged;
  (b) commercial redistribution — selling, licensing for a fee, or otherwise
      supplying Hypit or a derivative for commercial gain to third parties.

WHAT THIS MEANS FOR THIS CODEBASE — the following are OUT OF SCOPE BY DESIGN:

  * no per-customer workspace / project isolation,
  * no reselling of the rendering capability,
  * single deployment, single organization, internal callers only.

Clause 1(c) requires that the Hypit name, LOGO and copyright information
presented in the CLI output and in generated run reports and manifests are
neither removed nor modified. Therefore:

  * this module never rewrites, strips or reformats CLI output; it passes the
    JSON through verbatim,
  * endpoints that surface a manifest or report return Hypit's own document,
    including its `format` field and any attribution it carries,
  * when `hypit get` exports a Composite output, the exported directory is served
    as-is, `value.json` included.

Clause 3: video, audio, images and manifests produced through Hypit belong to
the user. Nothing here claims rights over the produced media.

SECURITY
--------
* Every command is built as an **argument array** and executed without a shell,
  so user input can never become shell syntax.
* `source` values are resolved and confined to the configured roots before use.
* No credential is read, stored or forwarded by this module. Provider keys stay
  in the OS credential store that Hypit already owns.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from .config import Settings
from .security import redact

logger = logging.getLogger(__name__)

BUILD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{6,128}$")
OUTPUT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,127}$")


class HypitError(RuntimeError):
    """A `hypit` invocation that failed, or that returned an error document."""

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        exit_code: int | None = None,
        argv: Sequence[str] = (),
        stdout: str = "",
        stderr: str = "",
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code
        self.argv = list(argv)
        self.stdout = stdout
        self.stderr = stderr
        self.hint = hint

    def as_detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {
            "error": "hypit_command_failed",
            "code": self.code,
            "message": str(self),
            "exitCode": self.exit_code,
            # Hypit's own stderr, verbatim: the caller asked for it and it is the
            # only faithful description of a Provider failure.
            "stderr": self.stderr.strip(),
        }
        if self.hint:
            detail["hint"] = self.hint
        return detail


class SourceError(ValueError):
    """A `source` value that failed validation before any process was started."""


@dataclass
class HypitResult:
    """A finished invocation plus its decoded JSON document (when there is one)."""

    argv: list[str]
    exit_code: int
    stdout: str
    stderr: str
    data: dict[str, Any] | None = None
    parsed: bool = True

    @property
    def ok(self) -> bool:
        return self.exit_code == 0


@dataclass
class SourceRef:
    """A validated source file that `hypit` is allowed to read."""

    path: Path
    kind: str  # "path" | "upload"
    original: str
    extra_args: list[str] = field(default_factory=list)


class HypitCli:
    """Async, shell-free wrapper. One instance per process."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._extra_env = self._build_env()

    # ------------------------------------------------------------------ env

    def _build_env(self) -> dict[str, str]:
        env = dict(os.environ)
        # Only PATH is altered, and only to place the `ps` shim in front of the
        # system binaries for Hypit's own process tree. No credential is added,
        # read or forwarded here.
        if self.settings.ps_shim_enabled:
            shim = self.settings.ps_shim_dir
            if (shim / "ps").exists():
                env["PATH"] = f"{shim}{os.pathsep}{env.get('PATH', '')}"
            else:
                logger.warning(
                    "ps shim enabled but %s is missing; local renders will fail at cleanup (run scripts/build_ps_shim.sh)",
                    shim / "ps",
                )
        return env

    # -------------------------------------------------------------- helpers

    def _tail_args(self, *, with_runtime: bool = True) -> list[str]:
        args: list[str] = []
        s = self.settings
        if s.hypit_workspace is not None:
            args += ["--workspace", str(s.hypit_workspace)]
        if s.hypit_package_root is not None:
            args += ["--package-root", str(s.hypit_package_root)]
        if with_runtime and s.hypit_runtime_profile is not None:
            args += ["--runtime", str(s.hypit_runtime_profile)]
        return args

    def _profile_args(self) -> list[str]:
        """Only the Runtime Profile. For `doctor` and the `runtime` family, which
        select their own project boundary and reject a workspace override."""
        if self.settings.hypit_runtime_profile is not None:
            return ["--runtime", str(self.settings.hypit_runtime_profile)]
        return []

    def _argv(self, args: Iterable[str]) -> list[str]:
        return [str(self.settings.hypit_bin), *args, "--json", "--color", "never"]

    # ----------------------------------------------------------- validation

    def resolve_source(self, source: str, *, must_exist: bool = True) -> SourceRef:
        """Confine a client-supplied path to the configured roots.

        Blocks `../` traversal, symlink escapes and any type that `hypit` does
        not read as an author/run source.
        """
        if not source or not isinstance(source, str):
            raise SourceError("`source` must be a non-empty string.")

        candidate = Path(source).expanduser()
        if not candidate.is_absolute():
            base = self.settings.hypit_workspace or self.settings.hypit_cwd
            candidate = base / candidate

        resolved = candidate.resolve()
        if resolved.suffix.lower() not in self.settings.allowed_source_suffixes:
            raise SourceError(
                f"`source` must end with one of {', '.join(self.settings.allowed_source_suffixes)}."
            )

        roots = list(self.settings.allowed_source_roots)
        if not any(_is_within(resolved, root) for root in roots):
            allowed = ", ".join(str(root) for root in roots)
            raise SourceError(f"`source` resolves outside the allowed roots: {resolved}. Allowed: {allowed}")

        if must_exist and not resolved.is_file():
            raise SourceError(f"`source` is not a readable file: {resolved}")

        return SourceRef(path=resolved, kind="path", original=source)

    def write_source(self, content: str, filename: str) -> SourceRef:
        """Persist inline source text so `hypit` can read it as a file.

        The file must live inside the workspace: `hypit` rejects a source outside
        the project root, and the workspace is where its own imports resolve.
        """
        if not content:
            raise SourceError("`content` must be a non-empty string.")
        encoded = content.encode("utf-8")
        if len(encoded) > self.settings.max_source_bytes:
            raise SourceError(
                f"`content` is {len(encoded)} bytes; the limit is {self.settings.max_source_bytes}."
            )

        suffix = Path(filename or "inline.svml").suffix.lower()
        if suffix not in self.settings.allowed_source_suffixes:
            raise SourceError(
                f"`filename` must end with one of {', '.join(self.settings.allowed_source_suffixes)}."
            )
        safe_stem = re.sub(r"[^A-Za-z0-9_\-]", "_", Path(filename).stem)[:48] or "inline"

        upload_dir = self.settings.upload_dir or (self.settings.hypit_workspace or self.settings.hypit_cwd)
        upload_dir = Path(upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        target = (upload_dir / f"{safe_stem}_{os.urandom(6).hex()}{suffix}").resolve()

        if not any(_is_within(target, root) for root in self.settings.allowed_source_roots):
            raise SourceError(f"Upload directory {upload_dir} is outside the allowed roots.")

        target.write_bytes(encoded)
        return SourceRef(path=target, kind="upload", original=f"inline:{filename or 'inline.svml'}")

    @staticmethod
    def validate_build_id(build_id: str) -> str:
        if not build_id or not BUILD_ID_PATTERN.match(build_id):
            raise SourceError("`buildId` has an unexpected shape.")
        return build_id

    @staticmethod
    def validate_output_name(name: str) -> str:
        if not name or not OUTPUT_NAME_PATTERN.match(name) or ".." in name:
            raise SourceError("`name` has an unexpected shape.")
        return name

    # --------------------------------------------------------------- runner

    async def run(
        self,
        args: Sequence[str],
        *,
        timeout: float,
        cwd: Path | None = None,
        expect_json: bool = True,
    ) -> HypitResult:
        argv = self._argv(args)
        logger.info("hypit exec: %s", " ".join(_quote(a) for a in argv))
        proc = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(cwd or self.settings.hypit_cwd),
            env=self._extra_env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError as exc:
            _kill(proc)
            raise HypitError(
                f"`hypit {' '.join(args[:2])}` exceeded its {timeout:.0f}s timeout.",
                code="BACKEND_TIMEOUT",
                argv=argv,
                hint="The build itself may still be running in the Runtime Worker; check the build list.",
            ) from exc

        stdout = stdout_b.decode("utf-8", "replace")
        stderr = stderr_b.decode("utf-8", "replace")
        exit_code = proc.returncode if proc.returncode is not None else -1

        data: dict[str, Any] | None = None
        parsed = False
        text = stdout.strip()
        if text:
            try:
                loaded = json.loads(text)
                if isinstance(loaded, dict):
                    data = loaded
                    parsed = True
            except json.JSONDecodeError:
                parsed = False

        if expect_json and not parsed and text:
            # Not a failure by itself: `logs` and a few human reports can emit
            # text, and a crash can emit nothing at all.
            logger.warning("hypit produced non-JSON stdout for %s", " ".join(args[:2]))

        result = HypitResult(argv=argv, exit_code=exit_code, stdout=stdout, stderr=stderr, data=data, parsed=parsed)

        if data is not None and data.get("ok") is False:
            error = data.get("error") or {}
            raise HypitError(
                str(error.get("message") or "hypit reported an error."),
                code=str(error.get("code") or "CLI_ERROR"),
                exit_code=exit_code,
                argv=argv,
                stdout=stdout,
                stderr=stderr,
                hint=str(error.get("help")) if error.get("help") else None,
            )
        if exit_code != 0 and data is None:
            raise HypitError(
                f"`hypit {args[0] if args else ''}` exited with code {exit_code} and produced no JSON.",
                code="CLI_EXIT",
                exit_code=exit_code,
                argv=argv,
                stdout=stdout,
                stderr=stderr,
            )
        return result

    # ----------------------------------------------------- command wrappers

    async def doctor(self) -> HypitResult:
        return await self.run(["doctor", *self._profile_args()], timeout=self.settings.query_timeout_seconds)

    async def runtime_status(self) -> HypitResult:
        return await self.run(
            ["runtime", "status", *self._profile_args()],
            timeout=self.settings.query_timeout_seconds,
        )

    async def activity(self) -> HypitResult:
        # `activity` reads the Runtime that received the Build, so it takes the
        # Profile but not a workspace.
        return await self.run(
            ["activity", *self._profile_args()],
            timeout=self.settings.query_timeout_seconds,
        )

    async def list_builds(self) -> HypitResult:
        # `builds` reads project Results and needs no Runtime.
        return await self.run(["builds", *self._tail_args(with_runtime=False)], timeout=self.settings.query_timeout_seconds)

    async def build_status(self, build_id: str) -> HypitResult:
        return await self.run(
            ["status", self.validate_build_id(build_id), *self._tail_args()],
            timeout=self.settings.query_timeout_seconds,
        )

    async def inspect(self, build_id: str) -> HypitResult:
        return await self.run(
            ["inspect", self.validate_build_id(build_id), *self._tail_args(with_runtime=False)],
            timeout=self.settings.query_timeout_seconds,
        )

    async def logs(self, build_id: str, lines: int) -> HypitResult:
        return await self.run(
            ["logs", self.validate_build_id(build_id), "--lines", str(lines), *self._tail_args()],
            timeout=self.settings.query_timeout_seconds,
        )

    async def history(self, output_name: str, limit: int) -> HypitResult:
        return await self.run(
            ["history", self.validate_output_name(output_name), "--limit", str(limit), *self._tail_args(with_runtime=False)],
            timeout=self.settings.query_timeout_seconds,
        )

    async def cancel(self, build_id: str, reason: str | None) -> HypitResult:
        args = ["cancel", self.validate_build_id(build_id)]
        if reason:
            args += ["--reason", reason[:400]]
        return await self.run([*args, *self._tail_args()], timeout=self.settings.query_timeout_seconds)

    async def check(self, source: SourceRef) -> HypitResult:
        return await self.run(
            ["check", str(source.path), *self._tail_args(with_runtime=False)],
            timeout=self.settings.query_timeout_seconds,
        )

    async def plan(self, source: SourceRef) -> HypitResult:
        return await self.run(
            ["plan", str(source.path), *self._tail_args()],
            timeout=self.settings.plan_timeout_seconds,
        )

    async def pricing(self, source: SourceRef) -> HypitResult:
        return await self.run(
            ["pricing", str(source.path), *self._tail_args()],
            timeout=self.settings.plan_timeout_seconds,
        )

    async def submit_build(self, source: SourceRef, title: str | None) -> HypitResult:
        """Submit a Build. Never uses `--follow`: the Worker owns execution."""
        args = ["build", str(source.path)]
        if title:
            args += ["--title", title[:160]]
        return await self.run([*args, *self._tail_args()], timeout=self.settings.submit_timeout_seconds)

    async def export_output(self, build_id: str, output_name: str, destination: Path) -> HypitResult:
        """`get` refuses to overwrite, so the caller must supply a fresh path."""
        if destination.exists():
            raise SourceError(f"Export destination already exists: {destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        return await self.run(
            [
                "get",
                self.validate_build_id(build_id),
                "--output",
                self.validate_output_name(output_name),
                "--to",
                str(destination),
                *self._tail_args(with_runtime=False),
            ],
            timeout=self.settings.download_timeout_seconds,
        )

    async def runtime_up(self) -> HypitResult:
        return await self.run(["runtime", "up", *self._profile_args()], timeout=1800)

    async def runtime_down(self) -> HypitResult:
        return await self.run(["runtime", "down", *self._profile_args()], timeout=120)

    # -------------------------------------------------------------- health

    def environment_report(self) -> dict[str, Any]:
        """Static facts about how this process will call Hypit. No secrets."""
        s = self.settings
        return {
            "hypitBin": str(s.hypit_bin),
            "hypitBinExists": s.hypit_bin.exists(),
            "hypitBinIsRepoLauncher": s.hypit_bin.name == "hypit" and s.hypit_bin.parent == s.hypit_cwd,
            "cwd": str(s.hypit_cwd),
            "cwdExists": s.hypit_cwd.is_dir(),
            "workspace": str(s.hypit_workspace) if s.hypit_workspace else None,
            "runtimeProfile": str(s.hypit_runtime_profile) if s.hypit_runtime_profile else None,
            "packageRoot": str(s.hypit_package_root) if s.hypit_package_root else None,
            "allowedSourceRoots": [str(r) for r in s.allowed_source_roots],
            "psShim": {
                "enabled": s.ps_shim_enabled,
                "path": str(s.ps_shim_dir / "ps"),
                "present": (s.ps_shim_dir / "ps").exists(),
            },
            "authEnabled": s.auth_enabled,
        }

    def warnings(self) -> list[str]:
        """Configuration problems worth surfacing on /health."""
        notes: list[str] = []
        s = self.settings
        if not s.hypit_bin.exists():
            notes.append(f"HYPIT_BIN does not exist: {s.hypit_bin}")
        if s.ps_shim_enabled and not (s.ps_shim_dir / "ps").exists():
            notes.append(
                "ps shim is missing; macOS 26 blocks the system `ps` for Node child processes, so local "
                "renders will fail at cleanup. Run scripts/build_ps_shim.sh."
            )
        if not s.auth_enabled:
            notes.append("HYPIT_API_TOKEN is unset; every request will be refused.")
        # Only meaningful where the shim is wanted. On Linux the system `ps` is
        # the right answer, so a missing compiler is not a problem worth a line
        # on /health — it just looks like one.
        if s.ps_shim_enabled and shutil.which("cc") is None and not (s.ps_shim_dir / "ps").exists():
            notes.append("No C compiler found, so the ps shim cannot be rebuilt.")
        return notes


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _quote(value: str) -> str:
    return value if re.fullmatch(r"[A-Za-z0-9_\-./=:@]+", value) else json.dumps(value)


def _kill(proc: "asyncio.subprocess.Process") -> None:
    try:
        proc.kill()
    except ProcessLookupError:
        pass
