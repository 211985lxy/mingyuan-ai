---
phase: 14-data-acquisition-layer
plan: "01"
subsystem: tikhub
tags: [url-parsing, platform-detection, pure-functions, tdd]
dependency_graph:
  requires: [apps/web/src/lib/tikhub/types.ts]
  provides: [apps/web/src/lib/tikhub/url-parser.ts]
  affects: [Phase 15 pipeline — detectPlatform + extractUserId are the pipeline entry points]
tech_stack:
  added: []
  patterns: [pure functions, never-throw pattern, URL constructor for safe parsing]
key_files:
  created:
    - apps/web/src/lib/tikhub/url-parser.ts
    - apps/web/__tests__/unit/url-parser.test.ts
  modified: []
key_decisions:
  - Used string includes() over URL hostname parsing for domain matching — more resilient to subdomain and path variations (e.g., v.douyin.com, xhslink.com)
  - Placed tests in apps/web/__tests__/unit/ to match existing vitest include pattern (__tests__/**/*.test.ts), not co-located with source
  - Explicit vitest imports (describe, it, expect from 'vitest') rather than globals to match project convention and satisfy TypeScript
metrics:
  duration: 272s
  completed_date: "2026-04-05T07:21:56Z"
  tasks_completed: 1
  files_created: 2
---

# Phase 14 Plan 01: URL Parser Summary

**One-liner:** Pure `detectPlatform` + `extractUserId` + `parseUrl` functions with domain-pattern matching for Douyin/XHS, zero-throw contract, and 21 unit tests.

## What Was Built

`apps/web/src/lib/tikhub/url-parser.ts` exports three pure functions and a type:

- `detectPlatform(url: string): Platform | null` — maps known domain patterns to platform identifiers; returns null for unsupported/invalid input; never throws
- `extractUserId(url: string): string | null` — parses URL path and extracts segment after `user` (Douyin) or `profile` (XHS); returns null if absent; never throws
- `parseUrl(url: string): ParsedUrl | null` — combines both; returns null if platform undetected
- `ParsedUrl` interface: `{ platform: Platform; rawUserId: string | null }`

Domain coverage:
| Pattern | Platform |
|---------|----------|
| `douyin.com`, `iesdouyin.com` | `'douyin'` |
| `xiaohongshu.com`, `xhslink.com`, `xhs.cn` | `'xiaohongshu'` |
| `bilibili.com`, `kuaishou.com`, anything else | `null` (deferred) |

## Test Coverage

21 tests in `apps/web/__tests__/unit/url-parser.test.ts`:
- All required URL patterns from the plan spec
- Edge cases: trailing slashes, no user segment, empty string, non-URL strings
- Case-insensitivity verification
- parseUrl integration: valid URLs return populated ParsedUrl, unsupported URLs return null

## Deviations from Plan

**1. [Rule 3 - Blocking Fix] Test file location and import style**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Plan spec showed co-located `__tests__/url-parser.test.ts` inside `src/lib/tikhub/` but vitest config uses `include: ["__tests__/**/*.test.ts"]` anchored at the app root. Co-located tests would not be discovered.
- **Fix:** Placed test at `apps/web/__tests__/unit/url-parser.test.ts` matching existing convention. Also changed globals (`describe`, `it`, `expect`) to explicit vitest imports per existing project test pattern (e.g., `end-to-end-flow.test.ts`), which also satisfies TypeScript strict checking.
- **Files modified:** `apps/web/__tests__/unit/url-parser.test.ts`
- **Commit:** c77c3b9

## Self-Check

### Files Created

- [x] `apps/web/src/lib/tikhub/url-parser.ts` — exists
- [x] `apps/web/__tests__/unit/url-parser.test.ts` — exists

### Commits

- [x] c77c3b9 — `feat(14-01): URL parsing module for platform detection and user ID extraction`

## Self-Check: PASSED
