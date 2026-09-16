#!/usr/bin/env python3
"""Prove the full variable-capable template flow end to end.

Constraint discovered: `hypit build` requires a RUN Source (.svrun, header
@hypit/run-markup@1) whose <author source="..."> names an Author Source FILE.
A bare .svml can never be built. So a build needs two files, while one API call
writes only one.

Flow proven here:
  1. POST /checks  {content: rendered markup} -> materialises it in the
     workspace (validate-only, no build) and reports its path.
  2. POST /builds  {content: .svrun referencing that path by basename} -> 3 MP4s.

Both files land in the same workspace dir, so a relative <author source="./x.svml"/>
resolves. Standard library only.
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
MARKUP = Path("/tmp/generic-card-author.svml")  # Author Source (NO <target>), ./templates/... paths
OUT_DIR = PROJECT_ROOT / "outputs"
OUT_DIR.mkdir(parents=True, exist_ok=True)

_ENV = {}
for raw in (PROJECT_ROOT / ".env").read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    _ENV[k.strip()] = v.strip()
TOKEN = _ENV.get("HYPIT_API_TOKEN", "")


def request(method, path, body=None, *, raw=False):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if TOKEN:
        req.add_header("X-API-Token", TOKEN)
    try:
        with urllib.request.urlopen(req, timeout=900) as resp:
            payload = resp.read()
            return resp.status, (payload if raw else json.loads(payload or b"{}")), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, (exc.read() if raw else json.loads(exc.read() or b"{}")), {}


def start_server():
    log = (OUT_DIR / "prove-template-flow.log").open("w", encoding="utf-8")
    proc = subprocess.Popen([str(PROJECT_ROOT / "run.sh")], cwd=str(PROJECT_ROOT),
                            stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + 120
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE + "/", timeout=2)
            return proc
        except Exception:
            time.sleep(1)
    proc.send_signal(signal.SIGTERM)
    raise SystemExit("server did not come up")


def find_path(obj, depth=0):
    """Best-effort: find a filesystem path to a .svml/.svrun inside a nested dict."""
    if depth > 6:
        return None
    if isinstance(obj, str):
        return obj if obj.endswith((".svml", ".svrun", ".svs")) else None
    if isinstance(obj, dict):
        for key in ("source", "author", "run", "path", "sourcePath", "file"):
            if key in obj:
                found = find_path(obj[key], depth + 1)
                if found:
                    return found
        for value in obj.values():
            found = find_path(value, depth + 1)
            if found:
                return found
    if isinstance(obj, list):
        for item in obj:
            found = find_path(item, depth + 1)
            if found:
                return found
    return None


def main() -> int:
    if not TOKEN or not MARKUP.is_file():
        raise SystemExit("missing token or markup file")
    server = start_server()
    try:
        d = time.time() + 300
        while time.time() < d:
            try:
                _, h, _ = request("GET", "/api/v1/health")
                if h.get("ok"):
                    break
            except Exception:
                pass
            time.sleep(2)

        # Step 1: materialise + validate the rendered Author Source.
        markup_text = MARKUP.read_text(encoding="utf-8")
        status, checked, _ = request("POST", "/api/v1/checks",
                                     {"content": markup_text, "filename": "tpl.svml"})
        print(f"POST /checks -> {status}")
        print("  check:", json.dumps(checked, ensure_ascii=False)[:800])
        if status != 200:
            print("  CHECK FAILED")
            return 1
        author_path = find_path(checked)
        print("  author path:", author_path)
        if not author_path:
            print("  could not recover the materialised path from /checks response")
            return 1
        author_name = os.path.basename(author_path)
        if not author_name.endswith(".svml"):
            print("  unexpected author filename:", author_name)
            return 1

        # Step 2: build a .svrun referencing it (same dir -> relative basename works).
        svrun = (
            '<?svml using="@hypit/run-markup@1"?>\n'
            '<svrun version="1">\n'
            f'  <author source="./{author_name}"/>\n'
            '  <target output="final-916.video"/>\n'
            '  <target output="final-169.video"/>\n'
            '  <target output="final-11.video"/>\n'
            '</svrun>\n'
        )
        status, job, _ = request("POST", "/api/v1/builds",
                                 {"content": svrun, "filename": "inline.svrun", "title": "template flow proof"})
        print(f"POST /builds (svrun content) -> {status}")
        print("  job:", json.dumps(job, ensure_ascii=False))
        if status not in (201, 202):
            print("  FAILED:", job.get("error"))
            return 1
        build_id = job.get("buildId")
        job_id = job.get("jobId")
        d = time.time() + 180
        while not build_id and job_id and time.time() < d:
            time.sleep(2)
            _, polled, _ = request("GET", f"/api/v1/jobs/{job_id}")
            if polled.get("state") in {"failed", "cancelled"}:
                print("  job failed:", polled.get("error"))
                return 1
            build_id = polled.get("buildId")
        if not build_id:
            print("  no buildId")
            return 1
        print("  buildId:", build_id)

        d = time.time() + 900
        outcome = None
        while time.time() < d:
            _, state, _ = request("GET", f"/api/v1/builds/{build_id}")
            build = state.get("build") or {}
            work = build.get("work") or {}
            print(f"    work={work.get('state')} outcome={work.get('outcome')}")
            if work.get("state") == "done":
                outcome = work.get("outcome")
                break
            time.sleep(5)
        print("  outcome:", outcome)
        if outcome != "complete":
            return 1

        _, insp, _ = request("GET", f"/api/v1/builds/{build_id}/inspect")
        outputs = (insp.get("build") or {}).get("outputs") or []
        print("  outputs:", [o.get("name") for o in outputs])
        ok = 0
        for name in ("final-916.video", "final-169.video", "final-11.video"):
            status, payload, _ = request(
                "GET", f"/api/v1/outputs/{urllib.parse.quote(name)}/download?build={urllib.parse.quote(build_id)}",
                raw=True)
            if status == 200 and payload:
                (OUT_DIR / f"proof-flow-{name.replace('.video', '.mp4')}").write_bytes(payload)
                is_mp4 = len(payload) >= 12 and payload[4:8] == b"ftyp"
                print(f"  {name}: {len(payload)} bytes mp4={is_mp4}")
                if is_mp4:
                    ok += 1
            else:
                print(f"  {name}: DOWNLOAD FAILED HTTP {status}")
        print(f"\nRESULT template-flow: {ok}/3 MP4 outputs produced and verified.")
        return 0 if ok == 3 else 1
    finally:
        server.send_signal(signal.SIGTERM)
        try:
            server.wait(timeout=15)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
