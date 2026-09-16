#!/usr/bin/env python3
"""Prove the generic three-ratio template renders three target outputs.

Standard library only. Starts the backend, submits templates/generic-card as a
`source` path, polls to completion, then inspects + downloads all three
`final-*.video` outputs and asserts each is a real MP4.

This is the "first real film" proof for the three-ratio multi-output pipeline.
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE = f"http://127.0.0.1:{os.environ.get('HYPIT_PORT', '8787')}"
TEMPLATE = PROJECT_ROOT / "templates" / "generic-card" / "generic-card.svrun"
OUT_DIR = PROJECT_ROOT / "outputs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Allow the templates dir as a source root (in addition to the smoke workspace
# configured in .env). macOS paths contain no ':' so ':' stays a clean separator.
SERVICES_ROOT = str(PROJECT_ROOT)
os.environ["HYPIT_ALLOWED_SOURCE_ROOTS"] = SERVICES_ROOT

# Client token comes from .env (loaded by run.sh), but the e2e client reads it
# the same way — replicate minimally.
_ENV = {}
ef = PROJECT_ROOT / ".env"
if ef.is_file():
    for raw in ef.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        _ENV[k.strip()] = v.strip()
TOKEN = _ENV.get("HYPIT_API_TOKEN", "")


def request(method, path, body=None, *, token=TOKEN, raw=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-API-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            payload = resp.read()
            return resp.status, (payload if raw else json.loads(payload or b"{}")), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, (exc.read() if raw else json.loads(exc.read() or b"{}")), {}


def start_server():
    log = (OUT_DIR / "prove-server.log").open("w", encoding="utf-8")
    proc = subprocess.Popen([str(PROJECT_ROOT / "run.sh")], cwd=str(PROJECT_ROOT),
                            stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + 60
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE + "/", timeout=2)
            return proc
        except Exception:
            time.sleep(1)
    proc.send_signal(signal.SIGTERM)
    raise SystemExit("server did not come up")


def wait_ready(timeout=180):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            _, body, _ = request("GET", "/api/v1/health")
            if body.get("ok"):
                print("  readiness: ok")
                return
        except Exception:
            pass
        time.sleep(2)
    print("  readiness: gave up")


def main() -> int:
    if not TOKEN:
        raise SystemExit("HYPIT_API_TOKEN missing")
    if not TEMPLATE.is_file():
        raise SystemExit(f"template missing: {TEMPLATE}")

    server = start_server()
    try:
        wait_ready()
        started = time.time()
        status, job, _ = request("POST", "/api/v1/builds",
                                 {"source": str(TEMPLATE), "title": "three-ratio proof"})
        print(f"POST /builds -> {status} ({time.time()-started:.1f}s)")
        print("  job:", json.dumps(job, ensure_ascii=False))
        assert status in (201, 202), f"submission not accepted: {status}"

        build_id = job.get("buildId")
        job_id = job.get("jobId")
        d = time.time() + 120
        while not build_id and job_id and time.time() < d:
            time.sleep(2)
            _, polled, _ = request("GET", f"/api/v1/jobs/{job_id}")
            if polled.get("state") in {"failed", "cancelled"}:
                print("  job failed:", polled.get("error"))
                return 1
            build_id = polled.get("buildId")
        assert build_id, "no buildId"
        print("  buildId:", build_id)

        d = time.time() + 600
        outcome = None
        while time.time() < d:
            _, state, _ = request("GET", f"/api/v1/builds/{build_id}")
            build = state.get("build") or {}
            work = build.get("work") or {}
            res = build.get("result") or {}
            print(f"    work={work.get('state')} outcome={work.get('outcome')} outputs={res.get('outputCount')}")
            if work.get("state") == "done":
                outcome = work.get("outcome")
                break
            time.sleep(5)
        print("  outcome:", outcome)
        assert outcome == "complete", f"build did not complete: {outcome}"

        # inspect → list outputs
        _, insp, _ = request("GET", f"/api/v1/builds/{build_id}/inspect")
        outputs = (insp.get("build") or {}).get("outputs") or []
        print("  outputs:", json.dumps(outputs, ensure_ascii=False))
        names = {o.get("name") for o in outputs}
        targets = [o.get("name") for o in outputs if o.get("target")]
        for expected in ("final-916.video", "final-169.video", "final-11.video"):
            assert expected in names, f"missing output {expected}"
        print(f"  targets ({len(targets)}): {targets}")

        # download + verify each target
        ok = 0
        for name in ("final-916.video", "final-169.video", "final-11.video"):
            status, payload, headers = request(
                "GET", f"/api/v1/outputs/{urllib.parse.quote(name)}/download?build={urllib.parse.quote(build_id)}",
                raw=True)
            target = OUT_DIR / f"proof-{name.replace('.video', '.mp4')}"
            if status == 200 and payload:
                target.write_bytes(payload)
                head = payload[:12]
                is_mp4 = len(head) >= 12 and head[4:8] == b"ftyp"
                print(f"  {name}: HTTP {status} {len(payload)} bytes mp4={is_mp4} ct={headers.get('content-type')}")
                assert is_mp4, f"{name} is not an MP4"
                ok += 1
            else:
                print(f"  {name}: DOWNLOAD FAILED HTTP {status}")
        print(f"\nRESULT: {ok}/3 MP4 outputs produced and verified.")
        return 0 if ok == 3 else 1
    finally:
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
