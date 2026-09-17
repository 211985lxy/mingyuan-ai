# Container acceptance — linux/arm64, 2026-09-16

The macOS acceptance run (`ACCEPTANCE-RUN.md`, 31/31) says the *service* is
correct. This run answers a different question: **does the rendering engine
actually work inside a Linux container?** Four things broke on the way, all of
them late and quiet. The point of writing this down is that each one had a
plausible wrong explanation that cost real time.

Environment: Docker 29.5.3 (desktop-linux), image `mingyuan/hypit-renderer:dev`,
built from `node:22-bookworm-slim` + `mwader/static-ffmpeg:9.0.1`, Hypit from an
extra BuildKit context (`/tmp/hypit-src`, a `node_modules`-free copy).

---

## What was verified

| Claim | Evidence |
| --- | --- |
| The image builds | Full build completes; the ffmpeg behaviour self-check passes |
| ffmpeg is the pinned static build | `command -v ffmpeg` → `/usr/local/bin/ffmpeg`; `ffmpeg -version` → 9.0.1 |
| `doctor` is clean on Linux | `ok: true`, `diagnosticCount: 0` |
| Both local providers are usable | `programs: {total: 2, ready: 2, unavailable: []}` |
| Chinese renders as glyphs, not boxes | Rendered `中文渲染测试 供暖系统` through the image's `chrome-headless-shell` and inspected the PNG |
| A Build runs in the container | Submitted cold, polled to `work=done result=complete` |
| The finished file is real media | `129 781` bytes, `video/mp4`; h264 1080×1920 / 30 fps / 180 frames + AAC / 283 frames / `duration=6.000000` |
| No credential leaks into the build context | `.dockerignore` excludes `.env`; no `COPY .` in the Dockerfile |

Build and export, as measured:

```
POST /api/v1/builds  {"source":"smoke.svrun","title":"container final"}
  -> 201  bld_20260916T112635618Z_D1C3230693

GET  /api/v1/builds/{id}      -> work=done result=complete   (15 s wall clock)
GET  /api/v1/outputs/final.video/download
  x-hypit-media-type: video/mp4
  content-disposition: attachment; filename="final.video.mp4"
  129781 bytes; first bytes 00 00 00 20 66 74 79 70   (ftyp)
```

Checked with an independent `ffprobe` on the host: h264 / 1080×1920 / 30 fps /
180 frames, aac / 283 frames, `duration=6.000000`. A frame extracted at 3 s shows
the sample's card image, so the output carries real visual content.

---

## The four traps

Listed in the order they were hit. Every one of them surfaced **after** frames
were rendered and encoded, and none of the error messages named the real cause.

### 1. `ps` is absent from the slim image → `spawn ps ENOENT`

```
Render cleanup failed; Error: spawn ps ENOENT
```

The macOS work had already fought a `ps` problem: macOS 26 sandboxes `ps` for
Node child processes, which returns `EPERM`, and that was fixed with a small
compiled shim (`tools/ps-shim/`). The plan therefore concluded "Linux's `ps` is
fine, do not carry the shim into the image."

**That conclusion was wrong in a way that looked right.** The shim is indeed
macOS-specific. But `node:22-bookworm-slim` does not ship `ps` at all, and
HyperFrames calls it during process-tree cleanup on Linux too. Same symptom,
different error code, and the fix is one package: `procps`.

Related, fixed in the same pass: `app/hypit_cli.py` warned "No C compiler found,
so the ps shim cannot be rebuilt" even with `HYPIT_PS_SHIM=0`, so a Linux
container reported a problem it did not have. The warning is now gated on the
shim actually being enabled.

### 2. Debian's ffmpeg 5.1 breaks the mux assertion

```
Endpoint media.local failed mux-program-media:
Final mux audio presentation span differs from TimelineAudio
```

`media-execution/src/execute.ts` asserts that the finished audio track presents
*exactly* `need.audio.sampleFrames`. AAC has encoder delay, which the mp4 edit
list trims — and 5.1 and 8.x trim differently. Same input, same command:

| ffmpeg | audio span | AAC frames | samples |
| --- | --- | --- | --- |
| 8.1 (macOS, already accepted) | 6.000000 s | 283 | 288 000 ✅ |
| 5.1 (bookworm) | 5.930000 s | 279 | 284 640 ❌ |
| 9.0.1 (static build, now pinned) | 6.000000 s | 283 | 288 000 ✅ |

**How the wrong explanation was ruled out.** The first suspicion was that
`ffprobe` 5.1 and 8.1 simply *report* the same file differently. Feeding one
ffprobe the other's output settles it: probing the 5.1-produced file from macOS
still reads 5.93 s. It is a difference in the produced bytes, so no probe change
can rescue it.

Two guards came out of this:

- The image copies a static ffmpeg/ffprobe (9.0.1) over the system pair.
  `media.local` resolves `ffmpeg` from `PATH`, so no profile change is needed.
- The Dockerfile **re-runs the mux at build time** and asserts `6.000000`. This
  turns "fails three minutes into a render" into "fails in the build".

### 3. HyperFrames' browser table has no `linux/arm64` entry

```
MANAGED_PROGRAM_DOWN
  hyperframes.local is not usable: HyperFrames browser is unavailable
```

Two different resolvers look for a browser and neither is portable:

| Consumer | Looks at | Wants |
| --- | --- | --- |
| `@hypit/browser-capture` | `$PUPPETEER_CACHE_DIR` | full Chrome, pinned `153.0.8010.12` |
| `@hyperframes/engine` | `$HYPERFRAMES_BROWSER_PATH`, else a hard-coded map | `chrome-headless-shell` |

The map in `@hyperframes/engine` covers `darwin/arm64`, `darwin/x64`,
`linux/x64` and `win32/*`. There is **no `linux/arm64` key**, so on Apple Silicon
the cache lookup can never succeed — the binary can be sitting in exactly the
expected place and the engine still reports it unavailable. (`linux/x64` covers
the production target, so this trap is arm64-only — which makes it easy to ship
broken and easy to misdiagnose.)

`scripts/resolve-browser.sh` pins `HYPERFRAMES_BROWSER_PATH` to whatever the
image actually installed, so the same image works on both architectures. It is
sourced by both `run.sh` and the container entrypoint, so a local run and a
container run cannot drift apart.

### 4. The Worker installs itself over the network on first `runtime up`

`hypit runtime up` pulls `@hyperframes`, `hyperframes`, `koffi`, `tsx` and
`typescript` into `~/.local/state/hypit/packages`. Cold, that exceeds 60 s; warm,
17 s. Left alone, every production cold start needs outbound network and the
first request of every fresh container pays the full install.

The image now runs `runtime up`/`down` once during the build, so the packages are
baked in. This also removed a misleading symptom: while the install was running,
a Build submitted in parallel sat in `submitting` and never progressed, which
looked like an API bug rather than a cold-start cost.

---

## Not covered

- **amd64.** Everything above was exercised on arm64. The build-time ffmpeg
  self-check runs on whatever arch is being built, so an amd64 repeat of trap 2
  would be caught by the build itself; traps 1 and 3 are arch-independent and
  trap 3 is arm64-only by definition.
- **Image size.** 6.11 GB. See "Known follow-ups" in the README for the two
  concrete cuts and the re-verification they need.
- **Paid providers.** Nothing here touched volcark / HypiHub. The whole run is
  local-only and costs zero, so it can be repeated freely.
