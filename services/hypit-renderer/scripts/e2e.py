#!/usr/bin/env python3
"""End-to-end acceptance run for the Hypit rendering backend.

Standard library only. Drives the HTTP API exactly as a website backend would and
writes a transcript to docs/ACCEPTANCE-RUN.md.

Usage:
    ./.venv/bin/python scripts/e2e.py                 # expects a running server
    ./.venv/bin/python scripts/e2e.py --start-server  # starts one, then stops it

What it proves:
  1. /health reports the runtime components
  2. authentication is enforced (401 without a token)
  3. a bad source comes back as a structured error carrying hypit's own stderr
  4. path traversal outside the allowed roots is refused
  5. a real Build is submitted, polled to `complete`, and its video is downloaded
  6. the downloaded file is a real MP4 and is not empty
  7. no API token ever appears in the server log
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE = f"http://127.0.0.1:{os.environ.get('HYPIT_PORT', '8787')}"
SMOKE_DIR = PROJECT_ROOT / "smoke"
SMOKE_RUN = "smoke.svrun"

TRANSCRIPT: list[str] = []
FAILURES: list[str] = []


def say(line: str = "") -> None:
    print(line, flush=True)
    TRANSCRIPT.append(line)


def load_env() -> dict[str, str]:
    env_file = PROJECT_ROOT / ".env"
    values: dict[str, str] = {}
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


ENV = load_env()
TOKEN = ENV.get("HYPIT_API_TOKEN") or os.environ.get("HYPIT_API_TOKEN", "")


def request(method: str, path: str, body: dict | None = None, *, token: str | None = TOKEN, raw: bool = False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-API-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=900) as response:
            payload = response.read()
            status = response.status
            headers = dict(response.headers)
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        status = exc.code
        headers = dict(exc.headers or {})
    if raw:
        return status, payload, headers
    try:
        return status, json.loads(payload.decode("utf-8")), headers
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, {"raw": payload.decode("utf-8", "replace")}, headers


def check(label: str, condition: bool, detail: str = "") -> None:
    mark = "PASS" if condition else "FAIL"
    say(f"  [{mark}] {label}{(' — ' + detail) if detail else ''}")
    if not condition:
        FAILURES.append(label)


def section(title: str) -> None:
    say()
    say(f"## {title}")
    say()


# ---------------------------------------------------------------- checks


def step_health() -> None:
    section("1. GET /api/v1/health")
    status, body, _ = request("GET", "/api/v1/health")
    say(f"  HTTP {status}")
    doctor = body.get("doctor", {})
    runtime = body.get("runtime", {})
    backend = body.get("backend", {})
    say(f"  ok={body.get('ok')} doctor.ok={doctor.get('ok')} diagnostics={doctor.get('diagnosticCount')}")
    say(f"  worker={runtime.get('worker', {}).get('state')} programs={runtime.get('programs')}")
    say(f"  hypitBin={backend.get('hypitBin')} workspace={backend.get('workspace')}")
    say(f"  psShim={backend.get('psShim')}")
    if body.get("warnings"):
        say(f"  warnings: {body['warnings']}")
    check("health endpoint answers", status == 200)
    check("doctor reports no diagnostics", doctor.get("ok") is True)
    check("runtime Worker is online", runtime.get("workerOnline") is True)
    check("ps shim present", bool(backend.get("psShim", {}).get("present")))


def step_auth() -> None:
    section("2. Authentication is enforced")
    status, body, _ = request("GET", "/api/v1/health", token=None)
    say(f"  no token      -> HTTP {status}")
    check("missing token is rejected with 401", status == 401)

    status, _, _ = request("GET", "/api/v1/health", token="wrong-token-value")
    say(f"  wrong token   -> HTTP {status}")
    check("wrong token is rejected with 401", status == 401)

    status, _, _ = request("GET", "/api/v1/health")
    check("correct token is accepted", status == 200)


def step_bad_source() -> None:
    section("3. A broken source returns a structured error with hypit's stderr")
    broken = SMOKE_DIR / "_e2e_broken.svml"
    broken.write_text(
        '<?svml using="@hypit/markup@1"?>\n'
        "<svml>\n"
        '  <import as="film" from="@hypit/film@1"/>\n'
        '  <film:Film id="main" canvas={missing-canvas} timeline={missing-timeline} appearance={missing-recipe}/>\n'
        "</svml>\n",
        encoding="utf-8",
    )
    try:
        status, body, _ = request("POST", "/api/v1/checks", {"source": str(broken)})
        say(f"  POST /checks (broken import) -> HTTP {status}")
        say(f"  body: {json.dumps(body, ensure_ascii=False)[:400]}")
        check("broken source is rejected", status == 400)
        check("error body carries a code", bool(body.get("code")))
        check("error body carries hypit's message", bool(body.get("message")))
        check("error body carries stderr verbatim", "stderr" in body)
    finally:
        broken.unlink(missing_ok=True)


def step_traversal() -> None:
    section("4. Source paths are confined to the allowed roots")
    attempts = [
        "../../../../../../etc/passwd",
        "/etc/hosts",
        str(PROJECT_ROOT / ".." / ".." / ".." / ".env"),
        "/Users/xiangyu/.ssh/id_rsa",
    ]
    for attempt in attempts:
        status, body, _ = request("POST", "/api/v1/checks", {"source": attempt})
        detail = (body.get("message") or body.get("detail") or "")[:110]
        say(f"  {attempt[:60]:<60} -> HTTP {status}: {detail}")
        check(f"refused: {attempt[:40]}", status == 400)

    status, body, _ = request(
        "POST", "/api/v1/checks", {"source": str(SMOKE_DIR / "smoke.svrun"), "content": "<svrun/>"}
    )
    check("supplying both source and content is refused", status == 422)


def step_build() -> str:
    section("5. Submit a real Build and poll it to completion")
    say("  source: smoke/smoke.svrun (local-only Runtime: 5 local requests, 0 Provider requests, zero cost)")
    started = time.time()
    status, job, _ = request("POST", "/api/v1/builds", {"source": str(SMOKE_DIR / SMOKE_RUN), "title": "e2e acceptance"})
    say(f"  POST /api/v1/builds -> HTTP {status} after {time.time() - started:.1f}s")
    say(f"  {json.dumps(job, ensure_ascii=False)}")
    check("submission accepted", status in (201, 202))

    build_id = job.get("buildId")
    job_id = job.get("jobId")
    deadline = time.time() + 120
    while not build_id and job_id and time.time() < deadline:
        time.sleep(2)
        _, polled, _ = request("GET", f"/api/v1/jobs/{job_id}")
        if polled.get("state") in {"failed", "cancelled"}:
            say(f"  job ended as {polled.get('state')}: {polled.get('error')}")
            break
        build_id = polled.get("buildId")
    say(f"  buildId = {build_id}")
    check("a build id was returned", bool(build_id))
    if not build_id:
        return ""

    say("  polling GET /api/v1/builds/{id} until the Result has an outcome ...")
    outcome = None
    deadline = time.time() + 420
    while time.time() < deadline:
        _, state, _ = request("GET", f"/api/v1/builds/{build_id}")
        build = state.get("build") or {}
        work = build.get("work") or {}
        result = build.get("result") or {}
        line = f"    work={work.get('state')} result={result.get('state')} outputs={result.get('outputCount')}"
        say(line)
        if work.get("state") == "done":
            outcome = work.get("outcome")
            break
        time.sleep(5)

    say(f"  outcome = {outcome}")
    check("build reached a terminal outcome", outcome is not None)
    check("build completed successfully", outcome == "complete")

    if outcome != "complete":
        _, state, _ = request("GET", f"/api/v1/builds/{build_id}")
        say(f"  failure: {(state.get('build') or {}).get('failure')}")

    say("  GET /api/v1/builds/{id}/logs?lines=8")
    _, logs, _ = request("GET", f"/api/v1/builds/{build_id}/logs?lines=8")
    for record in (logs.get("records") or [])[-4:]:
        say(f"    {record.get('time')} {record.get('endpoint')} {record.get('kind')}")
    check("execution log is readable", bool(logs.get("records")))
    return build_id


def step_export(build_id: str) -> Path | None:
    section("6. Export the produced video")
    status, hist, _ = request("GET", "/api/v1/outputs/final.video/history")
    say(f"  GET /api/v1/outputs/final.video/history -> HTTP {status}, {len(hist.get('entries') or [])} entries")
    check("output history lists the build", any(e.get("build") == build_id for e in hist.get("entries") or []))

    target = PROJECT_ROOT / "outputs" / "e2e-final.mp4"
    target.unlink(missing_ok=True)
    status, payload, headers = request(
        "GET",
        f"/api/v1/outputs/final.video/download?build={urllib.parse.quote(build_id)}",
        raw=True,
    )
    say(f"  GET /api/v1/outputs/final.video/download -> HTTP {status}")
    say(f"  content-type={headers.get('content-type')} bytes={len(payload)}")
    say(f"  content-disposition={headers.get('content-disposition')}")
    say(f"  x-hypit-build={headers.get('x-hypit-build')} x-hypit-output={headers.get('x-hypit-output')}")

    if status == 200 and payload:
        target.write_bytes(payload)
        with target.open("rb") as handle:
            head = handle.read(12)
        say(f"  saved {target} ({target.stat().st_size} bytes)")
        say(f"  first bytes: {head!r}")
        is_mp4 = len(head) >= 12 and head[4:8] == b"ftyp"
        check("download returned bytes", len(payload) > 1024)
        check("file is a real MP4 container", is_mp4)
        check("served as video/mp4", (headers.get("content-type") or "").startswith("video/mp4"))
        check("download filename carries an extension", ".mp4" in (headers.get("content-disposition") or ""))
        return target
    check("download succeeded", False, f"HTTP {status}")
    return None


def step_preview() -> None:
    section("7. Preview endpoints (no Build is started)")
    status, checks, _ = request("POST", "/api/v1/checks", {"source": str(SMOKE_DIR / SMOKE_RUN)})
    say(f"  POST /api/v1/checks -> HTTP {status} ok={checks.get('ok')} targets={checks.get('targets')}")
    check("check validates the sound source",checks.get("ok") is True)

    status, plan, _ = request("POST", "/api/v1/plans", {"source": str(SMOKE_DIR / SMOKE_RUN)})
    say(
        f"  POST /api/v1/plans  -> HTTP {status} requests={plan.get('requestCount')} "
        f"local={plan.get('localRequestCount')} provider={plan.get('providerRequestCount')}"
    )
    check("plan reports a local-only request set", plan.get("providerRequestCount") == 0)

    status, pricing, _ = request("GET", "/api/v1/pricing?source=" + urllib.parse.quote(str(SMOKE_DIR / SMOKE_RUN)))
    say(f"  GET  /api/v1/pricing -> HTTP {status} noCharge={pricing.get('noChargeRequestCount')}")
    check("pricing reports no charge for local work", pricing.get("noChargeRequestCount") == plan.get("requestCount"))


def step_no_secret_in_log(log_path: Path) -> None:
    section("8. No credential appears in the server log")
    if not log_path.is_file():
        say("  (no log file captured)")
        return
    text = log_path.read_text(encoding="utf-8", errors="replace")
    check("API token absent from log", TOKEN not in text)
    hits = re.findall(r"(?i)(api[_-]?key|bearer|volcark|hypihub\.oauth)\s*[:=]\s*\S+", text)
    say(f"  credential-shaped lines: {len(hits)}")
    check("no credential-shaped line in log", not hits)


# ---------------------------------------------------------------- driver


def start_server(log_path: Path) -> subprocess.Popen:
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [str(PROJECT_ROOT / "run.sh")],
        cwd=str(PROJECT_ROOT),
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 45
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE + "/", timeout=2)
            return process
        except Exception:  # noqa: BLE001 - still booting
            time.sleep(1)
    process.send_signal(signal.SIGTERM)
    raise SystemExit(f"server did not come up; see {log_path}")


def wait_until_ready(timeout: int = 120) -> None:
    """Wait for `/health` to report ok before measuring anything.

    The Worker is started by a background warm-up task during the lifespan
    handshake, so the port answers well before the runtime is usable. Probing
    immediately would record a cold-start state as a failure.
    """
    deadline = time.time() + timeout
    last = "…"
    while time.time() < deadline:
        try:
            _, body, _ = request("GET", "/api/v1/health")
            if body.get("ok"):
                say(f"  readiness: ok after warm-up (worker={body.get('runtime', {}).get('workerOnline')})")
                return
            last = f"ok=False worker={body.get('runtime', {}).get('workerOnline')}"
        except Exception as exc:  # noqa: BLE001 - still warming up
            last = f"{type(exc).__name__}"
        time.sleep(2)
    say(f"  readiness: gave up waiting, last state {last}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-server", action="store_true", help="start and stop the backend for this run")
    args = parser.parse_args()

    if not TOKEN:
        raise SystemExit("HYPIT_API_TOKEN not found in .env")

    log_path = PROJECT_ROOT / "outputs" / "server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    server: subprocess.Popen | None = None
    if args.start_server:
        server = start_server(log_path)

    say(f"# Hypit rendering backend — end-to-end acceptance run")
    say()
    say(f"- Started: {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    say(f"- Target:  {BASE}")
    say(f"- Token:   (supplied from .env, never printed)")

    try:
        if server is not None:
            wait_until_ready()
        step_health()
        step_auth()
        step_bad_source()
        step_traversal()
        build_id = step_build()
        if build_id:
            step_export(build_id)
        step_preview()
        time.sleep(1)
        step_no_secret_in_log(log_path)
    finally:
        if server is not None:
            server.send_signal(signal.SIGTERM)
            try:
                server.wait(timeout=15)
            except subprocess.TimeoutExpired:
                server.kill()

    say()
    say("## Result")
    say()
    if FAILURES:
        say(f"- **{len(FAILURES)} check(s) failed:**")
        for item in FAILURES:
            say(f"  - {item}")
    else:
        say("- **All checks passed.**")

    output = PROJECT_ROOT / "docs" / "ACCEPTANCE-RUN.md"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(TRANSCRIPT) + "\n", encoding="utf-8")
    print(f"\ntranscript written to {output}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
