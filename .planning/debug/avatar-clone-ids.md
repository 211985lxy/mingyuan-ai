---
status: awaiting_human_verify
trigger: "Avatar clone did not produce required IDs — selecting custom digital human avatar 小黑 and generating video fails; avatar card shows no cover image"
created: 2026-03-22T00:00:00Z
updated: 2026-03-22T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — Two separate root causes found:
  1. Avatar clone flow only ever stores `externalTaskId`; `externalVirtualmanId` and `externalSpeakerId` are populated ONLY by the webhook/cron callback. If the webhook never fires (or Shanjian cannot reach the callback URL in dev), the avatar stays status=ready (if manually forced) but has null IDs.
  2. The real API-returned avatar has `coverUrl` set to the OSS URL for the *source video* or *demo video*, but coverUrl is only populated when the clone succeeds AND a cover is transferred. If coverUrl is null or empty, the img tag is not rendered (conditional on `avatar.coverUrl`), leaving only the bg-muted placeholder.
  But: the PRIMARY bug is that an avatar can have `status: "ready"` in the DB with both `externalVirtualmanId` and `externalSpeakerId` being NULL — this happens when the avatar was manually set to "ready" or the webhook/poll did not receive the virtualmanId/speakerId from Shanjian.
test: Code trace of POST /api/tasks route.ts:121 — checks `!avatar.externalVirtualmanId || !avatar.externalSpeakerId` and returns 422
expecting: n/a — root cause confirmed
next_action: Fix both bugs

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: 1) Selecting a custom avatar and generating video should submit to Shanjian API successfully. 2) The avatar card should display the avatar's cover/thumbnail image.
actual: 1) Error "Avatar clone did not produce required IDs" prevents video submission. 2) Avatar card shows only a purple placeholder with no image.
errors: "Avatar clone did not produce required IDs" (red error text on UI)
reproduction: Go to 创建视频 page, select 我的数字人 tab, pick avatar "小黑", fill in video settings (视频结构: 清单归纳法, 内容模板: 避坑指南), click generate.
started: Current state on restore-original-ui branch

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-03-22T00:05:00Z
  checked: apps/web/src/app/api/tasks/route.ts:121-126
  found: Error thrown at `if (!avatar.externalVirtualmanId || !avatar.externalSpeakerId)` — both fields must be non-null for video submission to proceed
  implication: The avatar is status="ready" in DB but lacks the IDs that the Shanjian clone callback fills in

- timestamp: 2026-03-22T00:06:00Z
  checked: apps/web/src/app/api/avatars/route.ts POST handler
  found: After calling cloneFastAvatar/cloneProfessionalAvatar/cloneImageAvatar, only externalTaskId is stored on the Avatar record. externalVirtualmanId and externalSpeakerId are populated ONLY via webhook or poll-tasks cron (both parse result.virtualmanId and result.speakerId from the Shanjian callback)
  implication: If the webhook never fires (dev env, non-public server, etc.) AND poll-tasks hasn't run yet, the avatar can remain with null virtualman+speaker IDs. If the avatar status was manually set to "ready" (e.g., via admin or migration) without the IDs being set, this error occurs.

- timestamp: 2026-03-22T00:07:00Z
  checked: apps/web/src/app/(dashboard)/create/page.tsx:1134
  found: `{avatar.coverUrl && <img src={avatar.coverUrl} ... />}` — image only rendered if coverUrl is truthy. The API in GET /api/avatars generates thumbnailUrl from demoVideoUrl or sourceVideoUrl, NOT from coverUrl. The domain Avatar type is mapped in services.ts mapApiAvatarToAvatar: `coverUrl: a.coverUrl ?? ""` — coverUrl will be empty string if the API avatar has no coverUrl set.
  implication: An empty string is falsy in JS, so the img tag is skipped. The API returns a null/empty coverUrl when no cover image was transferred from Shanjian (i.e., the avatar was created but the clone callback did not deliver a coverUrl). Bug: coverUrl not being populated when it should be — OR the UI should fall back to thumbnailUrl/previewUrl for display.

- timestamp: 2026-03-22T00:08:00Z
  checked: GET /api/avatars response shape vs Avatar type mapping in services.ts
  found: The API generates `thumbnailUrl` (from demoVideoUrl or sourceVideoUrl via generateVideoThumbnailUrl) and `previewUrl` — but the create page ONLY checks `avatar.coverUrl`. The `thumbnailUrl` field IS mapped in mapApiAvatarToAvatar but the UI card ignores it.
  implication: The fix for the cover image bug is to use thumbnailUrl/previewUrl as fallback in the avatar card UI.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause:
  BUG 1 — When Shanjian clone completes and the webhook/poll-tasks receives the result, it writes `externalVirtualmanId: result?.virtualmanId ?? null`. If virtualmanId is absent from the result (null/undefined), the avatar is still marked status="ready" with null IDs. Then POST /api/tasks rejects with "Avatar clone did not produce required IDs" because it requires both fields to be non-null.
  BUG 2 — The avatar card in create/page.tsx only shows an image if `avatar.coverUrl` is truthy. Real avatars from the API may have null/empty coverUrl (cover image is only transferred from Shanjian if it provides one), but the API does compute a `thumbnailUrl` from the training video. The UI should fall back to thumbnailUrl/previewUrl.

fix:
  BUG 1 — In both webhook/shanjian/route.ts handleAvatarCallback() and api/cron/poll-tasks/route.ts avatar polling loop: only set status="ready" when result.virtualmanId is present. If virtualmanId is missing, set status="failed" with an appropriate error message.
  BUG 2 — In create/page.tsx avatar card for "我的数字人" tab: change the img src logic to use `avatar.thumbnailUrl || avatar.previewUrl || avatar.coverUrl` as the image source, and show it if any of those is truthy.

verification: Changes applied; TypeScript compiles clean (no new errors in changed files). Logic verified by code trace.
files_changed:
  - apps/web/src/app/api/webhook/shanjian/route.ts
  - apps/web/src/app/api/cron/poll-tasks/route.ts
  - apps/web/src/app/(dashboard)/create/page.tsx
  - apps/web/src/types/api.ts
  - apps/web/src/lib/mock/services.ts
