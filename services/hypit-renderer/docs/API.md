# API reference

Base URL: `http://127.0.0.1:8787/api/v1`

Interactive schema: `GET /api/v1/docs` (Swagger UI), `GET /api/v1/openapi.json`.

Every endpoint except `/` and `/api/v1/docs` requires the shared token:

```
X-API-Token: <HYPIT_API_TOKEN>
```

`Authorization: Bearer <HYPIT_API_TOKEN>` works too. A missing or wrong token is
`401`; a server started without `HYPIT_API_TOKEN` refuses everything with `503`
rather than serving unauthenticated callers.

Responses are the `hypit --json` documents with their `format` field intact, so a
caller that already knows the CLI output can reuse that knowledge. Fields added
by the backend are named in each section below.

---

## Health

### `GET /health`

`hypit doctor` plus `hypit runtime status`, merged. Read-only, no cost.

```json
{
  "format": "hypit-backend.health@1",
  "ok": true,
  "backend": {
    "hypitBin": "/Users/xiangyu/Doubao/skills/hypit-repo/hypit",
    "hypitBinExists": true,
    "cwd": "/Users/xiangyu/Doubao/skills/hypit-repo",
    "workspace": ".../hypit-backend/smoke",
    "runtimeProfile": ".../hypit-backend/smoke/hypit.runtime.json",
    "packageRoot": null,
    "allowedSourceRoots": [".../hypit-backend/smoke", "/Users/xiangyu/Doubao/skills/hypit-repo"],
    "psShim": { "enabled": true, "path": ".../bin/ps", "present": true },
    "authEnabled": true
  },
  "warnings": [],
  "queue": { "depth": 0 },
  "doctor": {
    "ok": true,
    "project": "/Users/xiangyu/Doubao/skills/hypit-repo",
    "profile": ".../smoke/hypit.runtime.json",
    "profileSource": "argument",
    "diagnosticCount": 0,
    "diagnostics": []
  },
  "runtime": {
    "ready": true,
    "attention": false,
    "workerOnline": true,
    "worker": { "state": "running" },
    "programs": { "total": 2, "ready": 2, "unavailable": [] },
    "buildsInFlight": { "submitting": 0, "working": 0, "savingResult": 0 },
    "capacity": { "active": 0 }
  }
}
```

`ok` is `doctor.ok && runtime.workerOnline`. `warnings` lists configuration
problems (missing binary, missing `ps` shim, unset token) — check it first when a
caller reports "rendering does nothing".

Use `backend.hypitBin` to confirm which executable is in play. On this machine
the checkout launcher and the global npm shim behave differently for local
renders; see [ACCEPTANCE.md](ACCEPTANCE.md).

---

## Builds

A **Build** is one execution attempt in Hypit's own vocabulary. Submission is
asynchronous: `POST /builds` never waits for rendering.

### Lifecycle

```
POST /builds ──> job (queued) ──> job (submitting) ──> job (submitted, buildId)
                                          └──────────> job (failed, error)

                         then, independently:
buildId ──> hypit status ──> work=done, outcome=complete|failed|cancelled
```

`hypit build` is invoked **without `--follow`**. Execution belongs to the Runtime
Worker, so a client disconnect — or a restart of this API process — cannot stop a
Build. `hypit builds`, `GET /builds` and `GET /activity` read the authoritative
state from the project Result repository.

### `POST /builds`

```json
{
  "source": "/absolute/or/workspace-relative/path/to/run.svrun",
  "title": "first cut",
  "wait_seconds": 15
}
```

or, for a source that does not exist on disk yet:

```json
{
  "content": "<?svml using=\"@hypit/run-markup@1\"?>\n<svrun version=\"1\">...</svrun>",
  "filename": "generated.svrun"
}
```

Exactly one of `source` / `content` is required. `wait_seconds` bounds how long
*this request* waits for the build id; it never bounds the Build.

Ready within the window — `201 Created`:

```json
{
  "jobId": "job_3f9a1c2d4b5e6f70",
  "state": "submitted",
  "buildId": "bld_20260916T082625078Z_EA4CF00D14",
  "source": ".../smoke/smoke.svrun",
  "title": "first cut",
  "createdAt": "2026-09-16T08:26:25.100Z",
  "updatedAt": "2026-09-16T08:26:31.402Z",
  "error": null,
  "note": null,
  "pollUrl": "/api/v1/jobs/job_3f9a1c2d4b5e6f70",
  "buildUrl": "/api/v1/builds/bld_20260916T082625078Z_EA4CF00D14"
}
```

Still submitting — `202 Accepted`, same shape with `"buildId": null` and
`"state": "submitting"`. Poll `pollUrl` until `buildId` appears.

Rejected source — `400`:

```json
{
  "error": "invalid_source",
  "message": "`source` resolves outside the allowed roots: /etc/hosts. Allowed: ..."
}
```

Submission itself failed (bad graph, missing dependency, Provider refusal) —
`400`/`502` with the job envelope, where `error` carries Hypit's own message and
stderr:

```json
{
  "jobId": "job_...",
  "state": "failed",
  "error": {
    "error": "hypit_command_failed",
    "code": "CLI_ERROR",
    "message": "film:Film.canvas cannot resolve missing-canvas",
    "exitCode": 1,
    "stderr": ""
  }
}
```

### `GET /builds`

`hypit builds --json`, newest first. Reads the project Result repository, needs no
Runtime.

```json
{
  "format": "hypit.cli-builds@1",
  "builds": [
    {
      "id": "bld_20260916T082625078Z_EA4CF00D14",
      "createdAt": "2026-09-16T08:26:25.078Z",
      "title": "e2e acceptance",
      "outcome": "complete",
      "run": "smoke.svrun",
      "targetCount": 1,
      "outputCount": 7
    }
  ]
}
```

### `GET /builds/{buildId}`

```json
{
  "format": "hypit.cli-status@1",
  "build": {
    "id": "bld_20260916T082625078Z_EA4CF00D14",
    "targets": ["final.video"],
    "title": "e2e acceptance",
    "work": { "state": "done", "outcome": "complete" },
    "result": { "state": "complete", "outputCount": 7 }
  }
}
```

While running, `work.state` is `working`/`submitting` and
`work.requests` counts completed requests. A failed Build carries `failure`, a
long string holding the failed operation and the Provider's own error — including
stderr from the underlying process. An unknown id returns
`{"format": "hypit.cli-status@1", "build": null}` with HTTP 200, which is how
Hypit itself reports it.

### `GET /builds/{buildId}/inspect`

Result targets, public outputs and outcome.

```json
{
  "format": "hypit.cli-inspect@1",
  "build": {
    "id": "bld_20260916T082625078Z_EA4CF00D14",
    "title": "e2e acceptance",
    "createdAt": "2026-09-16T08:26:25.078Z",
    "finishedAt": "2026-09-16T08:26:39.549Z",
    "outcome": "complete",
    "source": "smoke.svml",
    "run": "smoke.svrun",
    "targetCount": 1,
    "targets": ["final.video"],
    "outputCount": 7,
    "outputs": [
      {
        "name": "final.video",
        "type": "@hypit/artifact@1/BlobArtifact",
        "kind": "resource",
        "target": true,
        "highlighted": false,
        "mediaType": "video/mp4",
        "size": 132152
      }
    ],
    "otherOutputCount": 6,
    "executionLog": { "kind": "build-file", "path": "execution.jsonl", "size": 27858, "mediaType": "application/x-ndjson" }
  }
}
```

Returns Hypit's document unchanged, `format` included.

### `GET /builds/{buildId}/logs?lines=N`

`hypit logs --lines N --json`. Default `N=100`, maximum 5000.

```json
{
  "format": "hypit.cli-logs@1",
  "build": "bld_20260916T082625078Z_EA4CF00D14",
  "source": "result",
  "records": [
    {
      "endpoint": "hyperframes.local",
      "kind": "completed",
      "format": "hypit.execution-log@1",
      "time": 1789547198797,
      "command": "need:need:author%3A...%3Afinal:request-visual-render"
    }
  ],
  "omittedRecords": 63
}
```

`kind` is one of `started`, `completed`, `failed`, `diagnostic`. Finished Builds
keep their records in the Result repository, so logs survive a Runtime restart.
If Hypit answers in text instead of JSON, the backend returns
`{"format": "hypit.cli-logs@1", "text": "..."}` rather than inventing structure.

### `POST /builds/{buildId}/cancel`

```json
{ "reason": "superseded by the corrected Run" }
```

```json
{
  "format": "hypit.cli-cancel@1",
  "requested": true,
  "build": { "id": "bld_...", "work": { "state": "working" }, "result": { "state": "missing" } }
}
```

`requested: false` means there was nothing left to withdraw — the Build had
already finished. Cancellation is best effort: work that has not started is
withdrawn, an already submitted Provider operation is asked once to cancel, and
accepted output is retained.

### `GET /activity`

`hypit activity --json`: which Builds are active right now, plus the Worker state.

---

## Submission jobs

The job is the backend's own bookkeeping, not a Hypit concept. It exists so
`POST /builds` can answer immediately while the CLI preflight runs.

### `GET /jobs?limit=50`

```json
{
  "format": "hypit-backend.jobs@1",
  "jobs": [
    {
      "jobId": "job_3f9a1c2d4b5e6f70",
      "state": "submitted",
      "buildId": "bld_20260916T082625078Z_EA4CF00D14",
      "source": ".../smoke/smoke.svrun",
      "title": "e2e acceptance",
      "createdAt": "...",
      "updatedAt": "...",
      "error": null,
      "note": null
    }
  ]
}
```

`state` is one of `queued`, `submitting`, `submitted`, `failed`, `cancelled`,
`unknown`. `unknown` means the API process died mid-submission and the build could
not be matched afterwards; `GET /builds` still lists the truth.

### `GET /jobs/{jobId}`

One job. `404` with a structured body for an unknown id.

### `POST /jobs/{jobId}/cancel`

Cancels a queued job, or forwards to `hypit cancel` when its Build is already
submitted.

State is persisted to `state/jobs.json` (mode varies by umask; it holds no
credentials) and reloaded on start. On restart, jobs left in `submitting` are
reconciled against `hypit builds` by Run name and submission time.

---

## Outputs

### `GET /outputs/{name}/history?limit=20`

`hypit history <name> --limit N --json`.

```json
{
  "format": "hypit.cli-history@1",
  "output": "final.video",
  "entries": [
    {
      "build": "bld_20260916T082625078Z_EA4CF00D14",
      "title": "e2e acceptance",
      "createdAt": "2026-09-16T08:26:25.078Z",
      "outcome": "complete",
      "output": { "name": "final.video", "kind": "resource", "mediaType": "video/mp4", "size": 132152, "target": true }
    }
  ]
}
```

### `GET /outputs/{name}/download?build={buildId}`

Exports the Output with `hypit get` into a fresh directory under
`HYPIT_EXPORT_DIR` and streams it back. `build` is optional: omit it to use the
newest complete Build that produced this Output.

* A `resource` Output (video, image, audio) is streamed as its own file with a
  matching `Content-Type` and `Content-Disposition`.
* A `composite` Output becomes a directory (`value.json` plus referenced
  resources) and is zipped for transport, with `value.json` byte-for-byte intact.

Response headers:

```
X-Hypit-Build:  bld_20260916T082625078Z_EA4CF00D14
X-Hypit-Output: final.video
X-Hypit-Kind:   resource
```

Errors: `404` when no complete Build produced that name; `400` for a malformed
name; `502` with Hypit's stderr when the export itself fails.

The Result repository is never modified — `get` is an explicit export. Exports
older than `HYPIT_EXPORT_TTL_SECONDS` (default 24h) are pruned on the next
download.

### `GET /outputs/{name}/download-probe`

`{"output": "final.video", "buildId": "bld_...", "available": true}` — resolve the
Build a download would use without copying any bytes.

---

## Preview

Local or read-only-network. No Build is created and no generation is submitted,
so a front end may call these before asking for spending approval.

### `POST /checks`

Validates one Author or Run source (imports, types, graph edges).

Request: `{"source": ".../smoke.svrun"}` or `{"content": "...", "filename": "..."}`

```json
{
  "format": "hypit.cli-check@1",
  "sourceKind": "run",
  "ok": true,
  "run": "smoke.svrun",
  "author": "smoke.svml",
  "frontend": "@hypit/run-markup@1",
  "targetCount": 1,
  "targets": ["final.video"],
  "candidates": 0,
  "satisfactions": 0,
  "historicalOutputCount": 0
}
```

An invalid source is `400` with Hypit's own code and message:

```json
{ "error": "hypit_command_failed", "code": "CLI_ERROR", "message": "film:Film.canvas cannot resolve missing-canvas", "exitCode": 1, "stderr": "" }
```

### `POST /plans`

Freezes the demanded subgraph after Candidate selection and lists every external
request that *would* be sent, naming the Endpoint behind each one.

Request: `{"source": ".../smoke.svrun"}`

```json
{
  "format": "hypit.cli-plan@1",
  "ok": true,
  "run": "smoke.svrun",
  "targetCount": 1,
  "targets": ["final.video"],
  "requestCount": 5,
  "requestIssueCount": 0,
  "providerRequestCount": 0,
  "localRequestCount": 5,
  "unresolvedRequestCount": 0,
  "unsupportedRequestCount": 0,
  "providers": [
    {
      "request": "need:author%3A...%3Abed-media:normalize",
      "capability": "@hypit/media-pipeline@1#normalize-media",
      "status": "resolved",
      "endpoint": "media.local",
      "use": "@hypit/provider-media-local",
      "pricing": { "kind": "local" },
      "binding": "media.local"
    }
  ],
  "needs": [ "..." ]
}
```

Read `providerRequestCount` before authorizing anything: it counts the requests
that can incur a Provider charge. `localRequestCount` is work that costs nothing.
The `providers[].pricing.kind == "local"` field marks no-charge work explicitly.

### `GET /pricing?source={path}`

`hypit pricing <run-source> --json`. An explicit read-only network operation
against the selected Providers' published rates. Starts nothing.

```json
{
  "format": "hypit.cli-pricing@1",
  "run": "smoke.svrun",
  "requestCount": 5,
  "noChargeRequestCount": 5,
  "groups": []
}
```

For a Run with paid requests, `groups[]` holds the matched request parameters and
the Provider's rate documents with their source URLs. **Hypit calculates no
total** — match the published units against your expected duration, resolution and
count yourself, and keep any estimate distinct from measured usage.

---

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Invalid source (wrong suffix, outside the allowed roots, missing file), malformed request, or a Hypit error code that describes bad input (`CLI_ERROR`, `CLI_USAGE`, `ENOENT`) |
| `401` | Missing or wrong API token |
| `404` | Unknown job, or no complete Build carries that Output name |
| `422` | Request body failed schema validation (for example both `source` and `content`) |
| `502` | The engine failed: Provider error, render failure, timeout, export failure |
| `503` | The server has no `HYPIT_API_TOKEN` configured |

Failure bodies keep one shape:

```json
{
  "error": "hypit_command_failed",
  "code": "CLI_ERROR",
  "message": "human-readable cause",
  "exitCode": 1,
  "stderr": "hypit's own stderr, verbatim",
  "hint": "optional next action"
}
```

`stderr` is passed through unmodified, including Provider output. Anything that
looks like a credential is redacted first.

---

## Source validation rules

Applies to `source` in every endpoint.

* Absolute, or relative to `HYPIT_WORKSPACE`.
* After symlink resolution it must sit inside one of `allowedSourceRoots`
  (`HYPIT_ALLOWED_SOURCE_ROOTS`, plus the workspace and `HYPIT_CWD`). `../`
  traversal and symlink escapes are refused.
* Suffix must be in `HYPIT_ALLOWED_SOURCE_SUFFIXES` (default `.svml`, `.svs`,
  `.svrun`).
* Must exist and be a regular file.

Inline `content` is written into `HYPIT_UPLOAD_DIR` (default: the workspace) as
`<stem>_<random><ext>`, capped at `HYPIT_MAX_SOURCE_BYTES` (default 2 MiB). It must
land inside an allowed root, because `hypit` rejects any source outside the
project root.

Commands are executed as argument arrays with no shell, so nothing in a path,
title or filename is ever interpreted as shell syntax.
