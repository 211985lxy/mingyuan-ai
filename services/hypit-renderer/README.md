# Hypit rendering backend

HTTP wrapper around a locally installed `hypit` CLI (`@hypit/hypit` 0.1.10), so the
AIM web app can use Hypit as its rendering/generation engine instead of shelling
out by hand.

* `POST /api/v1/builds` submits a Build and answers with a build id without
  waiting for rendering.
* `GET /api/v1/builds/{id}` polls it; `GET /api/v1/builds/{id}/logs` reads the
  saved execution records.
* `GET /api/v1/outputs/{name}/download` exports the produced media.
* `POST /api/v1/plans` and `POST /api/v1/checks` preview what *would* run, at no
  cost, so a front end can show the work before anyone approves spending.

Full reference: [`docs/API.md`](docs/API.md). Interactive: `/api/v1/docs`.

---

## Quick start

```sh
cd hypit-backend

# 1. dependencies (a project-local virtualenv; nothing is installed globally)
/Users/xiangyu/.workbuddy/binaries/python/versions/3.13.12/bin/python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 2. configuration — .env is already generated here; copy .env.example for a new machine
./.venv/bin/python -c "import secrets;print(secrets.token_hex(32))"   # if you need a new token

# 3. the macOS 26 ps shim (see docs/ACCEPTANCE.md; local renders fail without it)
./scripts/build_ps_shim.sh

# 4. run
./run.sh
```

Then:

```sh
TOKEN=$(grep '^HYPIT_API_TOKEN=' .env | cut -d= -f2)

curl -s -H "X-API-Token: $TOKEN" http://127.0.0.1:8787/api/v1/health | head -40
```

Submit the bundled zero-cost smoke project (local rendering only — no Provider
account, no charge):

```sh
curl -s -X POST http://127.0.0.1:8787/api/v1/builds \
  -H "X-API-Token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"source":"smoke/smoke.svrun","title":"first run"}'
```

Poll, then download:

```sh
curl -s -H "X-API-Token: $TOKEN" http://127.0.0.1:8787/api/v1/builds/<buildId>
curl -s -H "X-API-Token: $TOKEN" -o final.mp4 \
  "http://127.0.0.1:8787/api/v1/outputs/final.video/download?build=<buildId>"
```

### End-to-end acceptance run

```sh
./.venv/bin/python scripts/e2e.py --start-server
```

Starts the backend, exercises every endpoint, and writes the transcript to
`docs/ACCEPTANCE-RUN.md`. It is safe to re-run: the smoke project is local-only
and costs nothing.

---

## Configuration

Everything comes from the environment. `.env.example` is the full list; `.env` is
the working copy and is git-ignored (it holds the API token).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HYPIT_API_TOKEN` | — | **Required.** Shared token. No token → the server refuses everything with 503. |
| `HYPIT_API_TOKEN_HEADER` | `X-API-Token` | Header name. `Authorization: Bearer …` is also accepted. |
| `HYPIT_BIN` | `/opt/hypit/hypit` | The CLI. **Point this at the checkout launcher on macOS** — see below. |
| `HYPIT_CWD` | `/opt/hypit` | Working directory. `hypit` resolves the project from the nearest `package.json` above it. |
| `HYPIT_WORKSPACE` | — | Explicit project when sources live outside `HYPIT_CWD`. `hypit` rejects any source outside the project root, so this is required for out-of-tree projects. |
| `HYPIT_RUNTIME_PROFILE` | — | Runtime Profile to use, e.g. `smoke/hypit.runtime.json` for the local-only project. Omit to use the project's own `.hypit/runtime` selection. |
| `HYPIT_PACKAGE_ROOT` | — | Override where the Worker resolves packages. |
| `HYPIT_PS_SHIM` | `darwin` → `1` | Prepend `bin/` to `PATH` for Hypit child processes (macOS 26 workaround). Defaults on only on macOS. |
| `HYPIT_RUNTIME_WARMUP` | `1` | Start the Build Worker during the lifespan handshake. Leave on under an orchestrator — see below. |
| `HYPIT_RUNTIME_WARMUP_TIMEOUT_SECONDS` | `60` | Give up on warm-up after this long; the first build then pays the start-up cost. |
| `HYPIT_SUBMIT_BLOCK_SECONDS` | `15` | How long `POST /builds` may wait for a build id before answering 202. |
| `HYPIT_MAX_CONCURRENT_SUBMISSIONS` | `2` | Concurrent `hypit build` invocations. |
| `HYPIT_ALLOWED_SOURCE_ROOTS` | workspace + `HYPIT_CWD` | Colon-separated extra roots a `source` may resolve inside. |
| `HYPIT_ALLOWED_SOURCE_SUFFIXES` | `.svml,.svs,.svrun` | Accepted source types. |
| `HYPIT_MAX_SOURCE_BYTES` | `2097152` | Cap for inline `content`. |
| `HYPIT_EXPORT_DIR` | `./outputs` | Where `hypit get` writes exports before they are streamed. |
| `HYPIT_EXPORT_TTL_SECONDS` | `86400` | Exports older than this are pruned on the next download. |
| `HYPIT_STATE_DIR` | `./state` | Job bookkeeping (`jobs.json`). No credentials. |

---

## Where this sits in AIM

This service is the **fourth provider** on AIM's video pipeline. It is never
reached by a browser: only the `apps/web` server calls it, over the internal
network, with the shared token.

```
apps/web  ──HTTP (internal + X-API-Token)──>  hypit-renderer  ──CLI──>  hypit Runtime Worker
   │                                              │
   │  polls build state                           │  renders → export dir
   └─ exports + re-uploads to OSS ←───────────────┘
```

| AIM side | Where |
| --- | --- |
| Provider client | `apps/web/src/lib/hypit.ts` |
| Submission branch | `apps/web/src/lib/digital-human-provider.ts` → `submitHypitVideo()` |
| Status polling | `apps/web/src/lib/task-recovery/video-polling.ts` |
| Input contract | `apps/web/src/lib/video-task-request/contracts.ts` |
| Concurrency slot | `apps/web/src/lib/digital-human-semaphore.ts` (`HYPIT_MAX_CONCURRENT`) |
| Feature switches | `HYPIT_ENABLED`, `HYPIT_SHADOW_MODE` |

**Polling, not webhooks.** The renderer lives on our own internal network, so
there is no reason to expose a public callback endpoint for it. AIM's existing
`task-recovery` poller already does the job, and one fewer public endpoint is one
fewer attack surface.

**Why the output takes a detour through OSS.** The renderer's export directory is
a TTL'd scratch cache (24 h) and is only reachable from the renderer host; a
`VideoTask` needs a durable `videoUrl`. Note the transfer uses
`uploadBufferToOss`, **not** `transferFromUrl` — the latter carries SSRF
protection and will correctly refuse an internal address.

**Shadow mode.** With `HYPIT_SHADOW_MODE=true` the pipeline runs end to end but
outputs land under an isolated `hypit-shadow/` prefix, so a trial run cannot
pollute the production artefact path.

---

## Running in a container

**Verified on Linux** (2026-09-16, linux/arm64): a full Build ran inside the
container and exported a real MP4 — h264 1080×1920 / 30 fps / 180 frames / AAC,
6.000000 s. The transcript is in [`docs/ACCEPTANCE-CONTAINER.md`](docs/ACCEPTANCE-CONTAINER.md).
Getting there needed four fixes that no amount of code reading would have
predicted; they are all in the Dockerfile with the evidence inline.

Hypit itself is deliberately *not* baked into
the repo or the image; the build takes it from an extra BuildKit context:

```sh
# 1) a source copy without node_modules (macOS native modules would break Linux)
rsync -a --exclude node_modules --exclude .hypit \
  ~/Doubao/skills/hypit-repo/ /tmp/hypit-src/

# 2) build
docker build -f services/hypit-renderer/Dockerfile \
  --build-context hypit=/tmp/hypit-src \
  -t mingyuan/hypit-renderer services/hypit-renderer
```

The image pins the pieces that fail *quietly* when missing:

| Pinned | Why it matters |
| --- | --- |
| `fonts-noto-cjk` | Without it, every Chinese glyph renders as a box. macOS hides this behind system fonts, so it only surfaces on the server. |
| Chrome `153.0.8010.12` | `@hypit/browser-capture` uses Chrome's native recording protocol, which landed in 153, and pins that exact build. |
| `chrome-headless-shell` `153.0.8010.36` | HyperFrames renders with the headless shell, not full Chrome. `@hypit/browser-capture` will not satisfy it. |
| `ffmpeg` **static 9.0.1** | The engine asserts an exact audio sample count after mux; Debian's 5.1 is off by 3 360 samples. See below. |
| `procps` | Provides `ps`. HyperFrames calls it during cleanup, and the slim image ships without it. |
| `unzip` | `@puppeteer/browsers` needs it to unpack Chrome. |
| Chrome shared libraries | The browser simply will not launch without them, and the error does not point at the missing library. |

### The four Linux-only traps

Each of these fails *late* and *quietly* — after frames are rendered and encoded,
with an error that does not name the real cause. All four were found by running
one real Build in the container, not by reading code.

1. **`ps` does not exist in `node:22-bookworm-slim`.** HyperFrames' process-tree
   cleanup shells out to `ps` on Linux too, so the Build dies at the last step
   with `Render cleanup failed; Error: spawn ps ENOENT`. The earlier assumption
   that `ps` was a macOS 26 problem was wrong — it is a *slim-image* problem.
   Fix: install `procps`.
2. **Debian's ffmpeg 5.1 breaks the mux assertion.** `media.local` asserts the
   finished audio track presents *exactly* the timeline's sample count
   (`Final mux audio presentation span differs from TimelineAudio`). AAC carries
   encoder delay that the mp4 edit list trims, and 5.1 and 8.x trim differently.
   Same input, same command:

   | ffmpeg | audio span | AAC frames | samples |
   | --- | --- | --- | --- |
   | 8.1 (macOS, already accepted) | 6.000000 s | 283 | 288 000 ✅ |
   | 5.1 (bookworm) | 5.930000 s | 279 | 284 640 ❌ |
   | 9.0.1 (static build, now pinned) | 6.000000 s | 283 | 288 000 ✅ |

   Probing the 5.1 output from macOS still reads 5.93 s, so this is a difference
   in the produced bytes — changing the probe does not help. The image now copies
   a static ffmpeg/ffprobe over the system pair, and a **build-time self-check**
   re-runs the mux and asserts `6.000000`, so this class of bug fails at build
   time instead of three minutes into a render.
3. **HyperFrames resolves its browser through a table with no `linux/arm64`
   entry.** `@hyperframes/engine` looks up `$HYPERFRAMES_BROWSER_PATH`, then a
   hard-coded platform/arch map (`darwin/arm64`, `darwin/x64`, `linux/x64`,
   `win32/*`). On Apple Silicon the cache lookup can never succeed and `hypit
   doctor` reports "HyperFrames browser is unavailable" with the binary sitting
   right there. `scripts/resolve-browser.sh` pins the path at runtime, so the
   image works on both arm64 and amd64.
4. **The Worker is installed on first `runtime up`, over the network.** That step
   pulls `@hyperframes`, `hyperframes`, `koffi`, `tsx` and `typescript` into
   `~/.local/state/hypit/packages` and takes over 60 s cold. The image now runs
   `runtime up`/`down` once at build time so production containers need no
   outbound network on start.

`app/config.py` still defaults `HYPIT_PS_SHIM` to `sys.platform == "darwin"`, so
the macOS 26 shim never follows the service into a Linux image — where the
system `ps` is the correct answer.

### Known follow-ups

- **The image is 6.11 GB.** Roughly: `/opt/hypit` 872 MB, the two Chrome builds
  690 MB + 266 MB, the runtime prep layer 1.37 GB. Two easy wins that need a
  re-verification run before shipping: drop the redundant full-Chrome
  `153.0.8010.36` build (only `.12` is pinned by `@hypit/browser-capture`), and
  `pnpm prune --prod` inside `/opt/hypit`.
- **amd64 has not been exercised.** Everything here was verified on arm64.
  The ffmpeg self-check runs at build time on whatever arch is being built, so
  an amd64 build would catch a repeat of trap 2 by itself.

---

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/v1/health` | `hypit doctor` + `hypit runtime status`, merged. Worker online, programs ready, endpoints configured. |
| `POST` | `/api/v1/builds` | Submit a Build. `201` with a build id, or `202` with a job id. |
| `GET` | `/api/v1/builds` | Project Results, newest first. |
| `GET` | `/api/v1/builds/{id}` | Current work, stage and Result state. |
| `GET` | `/api/v1/builds/{id}/inspect` | Targets, public outputs, outcome. |
| `GET` | `/api/v1/builds/{id}/logs?lines=N` | Saved execution records and diagnostics. |
| `POST` | `/api/v1/builds/{id}/cancel` | Withdraw one active Build. |
| `GET` | `/api/v1/activity` | Active Builds and shared capacity. |
| `GET` | `/api/v1/jobs`, `/api/v1/jobs/{id}` | Submission jobs owned by this process. |
| `POST` | `/api/v1/jobs/{id}/cancel` | Cancel a queued submission, or forward to the Build. |
| `GET` | `/api/v1/outputs/{name}/history` | Every Build that produced this Output. |
| `GET` | `/api/v1/outputs/{name}/download` | Export and stream the file (`?build=` optional). |
| `GET` | `/api/v1/outputs/{name}/download-probe` | Which Build a download would use, without exporting. |
| `POST` | `/api/v1/plans` | Frozen plan of what a Run would execute. No Build started. |
| `POST` | `/api/v1/checks` | Validate an Author or Run source. |
| `GET` | `/api/v1/pricing?source=` | Selected Providers' published rates for a Run. |

---

## How the async model works

```
POST /api/v1/builds
   └─ enqueue ──> job(queued) ──> hypit build <src> --json        (no --follow)
                                        │
                                        ├─ ok  ──> job(submitted, buildId)
                                        └─ err ──> job(failed, hypit message + stderr)

Runtime Worker ──(owns execution)──> project Result repository
                                        └─ read by GET /builds, /builds/{id}, /outputs/…
```

* `--follow` is never used: no HTTP connection is tied to a Build's lifetime.
* A client that disconnects, or an API process that is killed, cannot stop a
  Build. `state/jobs.json` is reloaded on start, and jobs interrupted mid
  submission are reconciled against `hypit builds` by Run name and time.
* Hypit's own build list is authoritative. If the backend's bookkeeping ever
  disagrees, `GET /api/v1/builds` is right.

---

## Operating notes for this machine

Three environment facts were found while building this and are documented in
detail — with reproduction commands — in [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).

**1. Use the checkout launcher, not the global CLI.**
`$HYPIT_BIN` should be `/Users/xiangyu/Doubao/skills/hypit-repo/hypit`. The npm
package `@hypit/hypit@0.1.8` still declares `workspace:*` dependencies, and the
global install has no `@hypit/` scope in its `node_modules`, so a Worker started
from it cannot resolve `@hypit/hyperframes` / `@hyperframes/engine` and every
local render fails. Submissions succeed either way — it is the Worker that owns
package resolution, so keep one CLI against one Runtime and `hypit runtime down`
before switching.

**2. The `ps` shim is required on macOS 26.**
macOS 26 refuses `spawn("/bin/ps")` from a Node child process (`EPERM`), and the
system `ps` prints nothing from a non-interactive shell. Hypit's local renderer
shells out to `ps` to reap its Chrome process tree, so without the shim every
local render ends with `Render cleanup failed; Error: spawn EPERM` — after all
frames were captured and encoded. `tools/ps-shim/ps.c` reimplements exactly the
two output shapes Hypit reads (`-A -o pid=,ppid=` and `-p <pid> -o stat=`) on top
of libproc, in ~8 ms. `run.sh` builds it automatically if `bin/ps` is missing.

If render failures still mention package resolution, the worker is stale:

```sh
cd /Users/xiangyu/Doubao/skills/hypit-repo
./hypit runtime down            # stop the Worker started by the other CLI
./hypit runtime up              # or just submit again; build restarts it
```

**3. Out-of-tree sources need `--workspace`.**
`hypit` refuses a source outside the project root. That is why `HYPIT_WORKSPACE`
points at `smoke/`. The backend validates every `source` against the allowed roots
before starting any process.

---

## Licence boundary

Hypit ships under a **modified Apache-2.0** licence. Read the LICENSE in the Hypit
repository; the operative lines are reproduced in the module docstring of
`app/hypit_cli.py`. In short:

**Permitted** — clause 1 explicitly allows using Hypit "as a rendering or
generation backend for applications your organization operates for itself", and
as internal enterprise tooling. That is what this service is.

**Not implemented, by design** — the licence forbids, without written
authorization from Hypit.AI:

* multi-tenant operation: one Hypit environment where two or more parties
  *outside your own organization* hold separate workspaces, whether or not a fee
  is charged;
* commercial redistribution: supplying Hypit, or a derivative, for commercial
  gain to third parties.

So this codebase has no tenant isolation, no per-customer workspace, and no
resale path. It is one deployment for one organization, reachable by internal
callers only — hence the mandatory API token.

**Attribution** — clause 1(c) forbids removing or modifying the Hypit name, LOGO
or copyright information in CLI output, run reports and manifests. This backend
never rewrites CLI output: JSON responses are passed through verbatim, including
their `format` field, and a composite export is zipped byte-for-byte with its
`value.json` intact. If your front end renders a Hypit report or manifest, keep
its attribution visible.

**Output ownership** — clause 3: videos, audio, images, manifests and every other
artifact produced through Hypit belong to you. This service claims no rights over
them.

---

## Security

* **Token required.** No anonymous access, even internally: anything on the
  network could otherwise spend Provider credit. Fail-closed `503` when
  `HYPIT_API_TOKEN` is unset. Constant-time comparison.
* **No shell.** Every command is an argument array via `create_subprocess_exec`.
  A path, title or filename can never become shell syntax.
* **Path confinement.** Sources are resolved (symlinks included) and must sit
  inside an allowed root, with an allowed suffix. `../`, absolute system paths and
  symlink escapes are refused with `400` before a process starts.
* **No credentials in code, config or logs.** Provider keys stay in the OS
  credential store that Hypit already uses. Nothing here reads, stores or
  forwards them; `redact()` scrubs the token and credential-shaped strings from
  error bodies before they are logged or returned.
* **Bounded work.** Timeouts on every invocation; bounded submission concurrency;
  a size cap on inline sources; exports are written only into `HYPIT_EXPORT_DIR`
  and pruned by age.
* **Localhost by default.** `HYPIT_HOST` defaults to `127.0.0.1`. Bind wider only
  behind your own network controls.

---

## Layout

```
hypit-backend/
  app/
    main.py            FastAPI app, lifespan, error handlers
    config.py          Environment-backed settings
    security.py        API-token dependency and log redaction
    hypit_cli.py       Shell-free CLI wrapper + source validation + licence notes
    jobs.py            Background submission queue, persistence, reconciliation
    schemas.py         Request models
    routers/           health · builds · outputs · preview
  bin/ps               Compiled ps shim (git-ignored; rebuild with scripts/)
  tools/ps-shim/ps.c   Its source
  smoke/               Zero-cost local-only Hypit project used for acceptance
  scripts/
    build_ps_shim.sh   Rebuild the shim
    e2e.py             End-to-end acceptance run
  docs/
    API.md             Endpoint reference with request/response examples
    ACCEPTANCE.md      Environment findings and fixes, with evidence
    ACCEPTANCE-RUN.md  Generated transcript of the last acceptance run
  run.sh               Loads .env and starts uvicorn
```

`smoke/` is a complete Hypit project: `smoke.svml` (a 1080×1920, 6 s, 180-frame
composition), `smoke.svrun`, `recipes.svs`, a Runtime Profile with only
`media.local` and `hyperframes.local`, and two assets copied from
`examples/ranking-football`. `POST /api/v1/plans` on it reports
`providerRequestCount: 0`, so it can be built as often as needed at no cost.
