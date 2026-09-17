# Environment findings and fixed issues

Recorded while building this backend. Two of these are environment defects that
would have made *every* local render fail, so they are documented in full.

The generated, timestamped transcript of the acceptance run itself lives in
[`ACCEPTANCE-RUN.md`](ACCEPTANCE-RUN.md).

---

## 1. macOS 26 blocks `ps` for Node child processes

**Symptom**

Every local render (HyperFrames → MP4) failed at the very last step, after all 180
frames had been captured and encoded:

```
Endpoint hyperframes.local failed render-visual:
Render cleanup failed; Error: spawn EPERM
```

**Root cause**

`packages/provider-hyperframes-local/src/capture-process.ts` → `killRenderTree()`
shells out to the system `ps` to build the Chrome process tree it must reap:

```ts
const { stdout } = await exec("ps", ["-A", "-o", "pid=,ppid="], { timeout: cleanupMs });
...
const state = await exec("ps", ["-p", String(child), "-o", "stat="], { timeout: cleanupMs })
```

On macOS 26 this machine returns `EPERM` when a Node process spawns `/bin/ps`:

```
$ node -e 'require("node:child_process").spawn("/bin/ps",["-A"])'
Error: spawn EPERM { errno: -1, code: 'EPERM', syscall: 'spawn' }
```

Reproduced outside Hypit entirely. `/bin/ps` is an Apple-signed platform binary
(`Identifier=com.apple.ps`, `Platform identifier=26`); `spawn` of it is refused,
while ordinary binaries (`ls`, `sh`, `ffmpeg`) and `/usr/bin/pgrep` spawn fine.
Invoking `/bin/ps` directly from a non-interactive shell also prints nothing
(`operation not permitted`).

Two consequences in Hypit, in order:

1. the first `ps` call throws → `Render cleanup failed; Error: spawn EPERM`;
2. even with that call working, the second shape `ps -p <pid> -o stat=` must
   answer, or the cleanup loop spins until its deadline and fails with
   `Render process <pid> did not stop after SIGKILL`.

**Fix — `bin/ps`, a libproc-based shim**

`tools/ps-shim/ps.c` implements exactly those two output shapes using
`proc_listpids` / `proc_pidinfo` instead of the restricted binary. It is a
deliberately narrow replacement, not a general `ps`: it never prints command
lines, users, CPU or memory.

```sh
./scripts/build_ps_shim.sh      # cc -O2 -o bin/ps tools/ps-shim/ps.c
```

It measures ~8 ms for the full 750-row table, well inside Hypit's 5 s cleanup
budget. `app/hypit_cli.py` prepends `bin/` to `PATH` **only for Hypit child
processes**; nothing else on the machine is affected. Disable with
`HYPIT_PS_SHIM=0` once macOS stops blocking `ps`.

> Permission to the process tree is unchanged: the shim only reads pid/ppid and a
> status letter, all through the public libproc API.

---

## 2. The npm-installed CLI cannot run local renders

**Symptom**

With `HYPIT_BIN=/Users/xiangyu/.npm-global/bin/hypit`, renders failed for a
different reason once the Worker was (re)started by that CLI:

```
Cannot find package '@hypit/hyperframes' imported from
  /Users/xiangyu/.npm-global/lib/node_modules/@hypit/hypit/packages/provider-hyperframes-local/src/render.ts
```

and, after a restart, the sibling failure:

```
Cannot find package '@hyperframes/engine' imported from .../provider-hyperframes-local/src/render.ts
```

**Root cause**

The published package still declares workspace-only dependencies:

```json
"dependencies": {
  "@hypit/hyperframes": "workspace:*",
  "@hyperframes/engine": "0.7.101",
  ...
}
```

`/Users/xiangyu/.npm-global/lib/node_modules/@hypit/hypit/node_modules/` contains
no `@hypit/` scope at all, so a Worker the global CLI starts cannot resolve
`@hypit/hyperframes`. The checkout at `~/Doubao/skills/hypit-repo` is a pnpm
workspace where `node_modules/@hypit/hyperframes → packages/hyperframes` does
exist, and renders succeed there.

Note the split: the **submission** step succeeds with either CLI. It is the
**Worker** — started by whichever CLI first brought it up — that owns package
resolution. Mixing the two CLIs against one Runtime is what makes this look
intermittent.

**Fix**

`HYPIT_BIN` defaults to the checkout launcher
`/Users/xiangyu/Doubao/skills/hypit-repo/hypit`. Keep one CLI against one Runtime:
if you switch `HYPIT_BIN`, run `hypit runtime down` first so the Worker restarts
under the new launcher. `HYPIT_PACKAGE_ROOT` is exposed for deployments that
resolve packages from an explicit directory instead.

A controlled experiment ruled out the other candidate explanation. Adding a
`node_modules` symlink inside the smoke project (pointing at the checkout's
`node_modules`) did **not** change the failure — so the workspace is not what
resolves these packages. Removing that symlink and building again with the
checkout launcher still produced `outcome: complete`. The CLI that starts the
Worker is the only variable.

`GET /api/v1/health` returns the resolved `backend.hypitBin` for exactly this
reason — check it before blaming the API for a render failure.

---

## 3. `source` must live inside the project (`--workspace` is mandatory out of tree)

`hypit` resolves the project from the nearest `package.json` above its working
directory, and refuses a source outside it:

```
Source /Users/.../tmp-bad/broken.svrun is outside workspace root /Users/xiangyu/Doubao/skills/hypit-repo
```

Because the backend's working directory is the Hypit checkout, any project kept
elsewhere — such as `smoke/` — has to be named with `--workspace`. The backend
does that from `HYPIT_WORKSPACE`, and validates every `source` against the allowed
roots before starting a process.

Verified behaviour, used as an acceptance check: `../../../../../../etc/passwd`,
`/etc/hosts`, `~/.ssh/id_rsa` and `<project>/../../.env` are all refused with `400`
before any process is started.

---

## 4. Requests are not the place to wait for a build

`hypit build` without `--follow` returns after durable submission — measured at
~2–7 s including a Worker start. That is the only reason this API can answer
`POST /builds` with a build id inside a normal request window. The design still
does not depend on it:

* the request waits at most `HYPIT_SUBMIT_BLOCK_SECONDS` (default 15 s);
* if submission is slower, the answer is `202` with a job id and the client polls;
* in no case does the request wait for rendering.

`--follow` is never used, so no HTTP connection is tied to a Build's lifetime. A
killed API process cannot cancel a Build: execution belongs to the Runtime Worker,
and `GET /api/v1/builds` reads the Result repository directly.

---

## Verification summary

| Claim | How it was verified |
| --- | --- |
| Local render completes | 6 s / 1080×1920 / 30 fps / 180 frames render → `outcome: complete`, 7 outputs |
| Output can be exported | `hypit get` produced a 132 152-byte MP4 (`ftyp` container verified) |
| The exported file is real video | `ffprobe`: `h264 1080×1920 30/1 180 frames`, `aac` audio, `duration=6.000000` — exactly what the source declared |
| Async submission | `POST /builds` returns a build id without `--follow` (measured 2.4 s); polls reach `work.state=done` |
| Failures are structured | bad graph → `400` with `code` + `message` + `stderr`; render failure → reason in `build.failure` |
| Token enforced | no token `401`, wrong token `401`, correct token `200`; server without a token `503` |
| No credentials in logs | API token and credential-shaped patterns absent from `outputs/server.log` |
| Path confinement | traversal, absolute system paths and project-relative escapes all refused with `400` |
| No API key in code | `grep -ri` for key material over `app/ scripts/ tools/ docs/ smoke/` returns nothing; keys stay in the OS credential store |
| Download filename is usable | `Content-Disposition: attachment; filename="final.video.mp4"` — the logical output name has no extension, so the bytes are sniffed |

`ffprobe` output for the exported file:

```
codec_name=h264      codec_type=video   width=1080  height=1920
r_frame_rate=30/1    nb_frames=180
codec_name=aac       codec_type=audio   nb_frames=283
format_name=mov,mp4,m4a,3gp,3g2,mj2     duration=6.000000   size=132152
```

See [`ACCEPTANCE-RUN.md`](ACCEPTANCE-RUN.md) for the transcript produced by
`scripts/e2e.py`.
