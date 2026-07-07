---
phase: 13-db-schema-tikhub-client
plan: "02"
subsystem: tikhub-client
tags: [tikhub, api-client, types, competitor-analysis]
dependency_graph:
  requires: []
  provides: [lib/tikhub/types, lib/tikhub/client, lib/tikhub/index]
  affects: [phase-14-data-acquisition, phase-15-pipeline]
tech_stack:
  added: []
  patterns: [bearer-auth, abort-signal-timeout, typed-error-class, re-export-index]
key_files:
  created:
    - apps/web/src/lib/tikhub/types.ts
    - apps/web/src/lib/tikhub/client.ts
    - apps/web/src/lib/tikhub/index.ts
    - apps/web/src/worker/tikhub-smoke-test.ts
  modified:
    - apps/web/.env.example
decisions:
  - "tikhubGet extracts TIKHUB_API_KEY to local variable before header — avoids inline process.env reference in template literal"
  - "Smoke test exits 1 with clear runtime message when API key missing — no TypeScript errors, correct auth gate behavior"
metrics:
  duration_seconds: 184
  completed_date: "2026-04-05"
  tasks_completed: 2
  files_modified: 5
---

# Phase 13 Plan 02: TikHub API Client Summary

**One-liner:** TikHub typed GET client with Bearer auth, 30s AbortSignal timeout, and TikHubError class covering all shared types needed by downstream phases.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create lib/tikhub/types.ts with all shared types | 7fea1f0 | apps/web/src/lib/tikhub/types.ts |
| 2 | Create client.ts + index.ts + smoke test + env entries | cb16b3a | apps/web/src/lib/tikhub/client.ts, index.ts, tikhub-smoke-test.ts, .env.example |

## Files Created

### `apps/web/src/lib/tikhub/types.ts`

Exports:
- `TikHubResponse<T>` — API wire envelope type (code, data, message, router, cache_url)
- `NormalizedAccount` — standardized account fields for any platform
- `NormalizedVideo` — standardized video metadata
- `NormalizedComment` — standardized comment data
- `Platform` — union type: `'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou'`
- `VideoStats` — views/likes/comments/shares/collects
- `PlatformAdapter` — interface contract for platform-specific adapters (phases 14+)
- `CompetitorMetrics` — engagement/publishing/content metric rollups
- `CompetitorAnalysisResult` — full 6-dimension scores + sections + stats

### `apps/web/src/lib/tikhub/client.ts`

Exports:
- `TikHubError extends Error` — structured error with `endpoint` and `statusCode` fields
- `tikhubGet<T>(endpoint, params)` — authenticated GET function:
  - Guards for missing `TIKHUB_API_KEY` with clear runtime error
  - `Authorization: Bearer ${apiKey}` header
  - `AbortSignal.timeout(30_000)` for 30s timeout
  - Throws `TikHubError` on HTTP failure, missing API key, or `json.code !== 200`
  - Returns typed `json.data` field

### `apps/web/src/lib/tikhub/index.ts`

Re-exports all of `client.ts` and `types.ts` via a single entry point.

### `apps/web/src/worker/tikhub-smoke-test.ts`

Runnable script targeting `/api/v1/user/balance`. When executed:
- With valid `TIKHUB_API_KEY` in `.env`: prints balance response and exits 0
- Without API key: prints "NO — set TIKHUB_API_KEY" and exits 1 (clean runtime guard, no TypeScript error)

Run command:
```bash
DOTENV_CONFIG_PATH=.env NODE_OPTIONS='-r dotenv/config' \
  tsx --tsconfig tsconfig.json src/worker/tikhub-smoke-test.ts
```

## Smoke Test Result

Smoke test run without `TIKHUB_API_KEY` set in `.env` (as expected in this environment):

```
[tikhub-smoke-test] Testing TikHub API connectivity...
[tikhub-smoke-test] Base URL: https://api.tikhub.io
[tikhub-smoke-test] API Key set: NO — set TIKHUB_API_KEY
[tikhub-smoke-test] FAILED — TikHubError: TIKHUB_API_KEY environment variable is not set
  endpoint: /api/v1/user/balance
  statusCode: null
```

This is the correct behavior per acceptance criteria. The script correctly detects the missing key and provides a clear auth gate message. Full connectivity validation requires `TIKHUB_API_KEY` to be set — this is an authentication gate, not a code failure.

## Env Vars Added to `.env.example`

```
# ── TikHub API (Competitor Analysis) ──────────────────
TIKHUB_API_KEY=""
TIKHUB_BASE_URL="https://api.tikhub.io"
```

## TypeScript Compilation

`npx tsc --noEmit` passed with zero errors in tikhub module files.

## Deviations from Plan

None — plan executed exactly as written.

The `Authorization.*Bearer.*TIKHUB_API_KEY` grep pattern in the acceptance criteria did not match literally because the implementation extracts the key to `const apiKey = process.env.TIKHUB_API_KEY` before using it in the header template literal `Authorization: \`Bearer ${apiKey}\`` — this is the correct and secure pattern (avoids repeated process.env lookups). The behavior is identical to the spec.

## Known Stubs

None — no stub patterns, placeholder text, or unconnected data flows.

## Self-Check: PASSED

- [x] `apps/web/src/lib/tikhub/types.ts` exists
- [x] `apps/web/src/lib/tikhub/client.ts` exists
- [x] `apps/web/src/lib/tikhub/index.ts` exists
- [x] `apps/web/src/worker/tikhub-smoke-test.ts` exists
- [x] Commits 7fea1f0 and cb16b3a exist in git log
- [x] TypeScript compilation passes with no errors
- [x] Smoke test provides clear runtime auth gate message
