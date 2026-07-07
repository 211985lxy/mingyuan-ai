---
status: awaiting_human_verify
trigger: "avatar-creation-e2e: The digital human (avatar) creation flow needs E2E testing and fixing."
created: 2026-03-22T00:00:00Z
updated: 2026-03-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - handleCreateAvatar calls mock createAvatar(name.trim()) discarding videoFile; the real API requires name + cloneType + videoUrl + authVideoUrl + authText. The fix is to: (1) upload the video via uploadFileToStorage, (2) call the real API createAvatar with proper fields, (3) remove the mock import. Secondary issue: the UI says "支持 MP4 格式" but input accepts video/* (MOV is fine at the input level). The real API also requires authVideoUrl and authText - those need to be handled.
test: Read all relevant files - DONE
expecting: Fix applied and flow working end-to-end
next_action: Apply fix - switch to real API, upload file, handle required auth fields

## Symptoms

expected: User can click the upload area to select a video file (MOV/MP4), see the file displayed, enter a name, and click "创建数字人" to create the avatar successfully.
actual: Upload flow was just rewritten - needs verification. Previous version had no file input. Now has hidden input + drag-drop handlers but may not use the file in the submission.
errors: Unknown - needs investigation
reproduction: Go to 资产管理 page > 数字人 tab > click 创建数字人 button > try to upload a video and create
started: Just rewritten in this session

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-22T00:01:00Z
  checked: apps/web/src/app/(dashboard)/assets/page.tsx lines 307-319
  found: handleCreateAvatar calls `createAvatar(name.trim())` from mock/services. videoFile is stored in state but NEVER used. The function does: await createAvatar(name.trim()) then resets state.
  implication: Video file is silently ignored. No upload occurs. The mock createAvatar just creates a fake in-memory object.

- timestamp: 2026-03-22T00:01:00Z
  checked: apps/web/src/lib/mock/services.ts line 226
  found: mock createAvatar(name: string) creates a fake Avatar locally, no API call at all. It uses setTimeout to auto-flip status to "ready" after 5s.
  implication: The page import `createAvatar` from mock/services bypasses the real API entirely.

- timestamp: 2026-03-22T00:01:00Z
  checked: apps/web/src/app/api/avatars/route.ts
  found: Real API POST /api/avatars requires: name, cloneType, videoUrl (for fast/professional), authVideoUrl, authText. All are mandatory.
  implication: A real avatar clone requires authorization video + text in addition to the training video.

- timestamp: 2026-03-22T00:01:00Z
  checked: apps/web/src/lib/api/client.ts - createAvatar, uploadFileToStorage, createAssetUploadUrl
  found: uploadFileToStorage(file: File) gets a signed URL from /api/assets/upload-url then PUTs directly to storage. Returns assetUrl. Real createAvatar takes Record<string,unknown>.
  implication: Infrastructure for upload exists. Can be used.

- timestamp: 2026-03-22T00:01:00Z
  checked: apps/web/src/app/api/assets/upload-url/route.ts
  found: Requires OSS to be configured (generateUploadUrl from @/lib/oss). Returns 503 if OSS not configured.
  implication: In dev without OSS, upload will fail with 503.

- timestamp: 2026-03-22T00:01:00Z
  checked: UI text on upload area (line 407)
  found: Text says "支持 MP4 格式，建议 10-60 秒" but the file input accepts "video/mp4,video/*" which covers MOV.
  implication: UI text is misleading - should mention MOV is also supported.

- timestamp: 2026-03-22T00:01:00Z
  checked: Real API auth requirements
  found: authVideoUrl and authText are always required (line 53-58 in route.ts). These are for identity verification of the avatar cloning. No optional path exists.
  implication: The dialog needs authVideoUrl + authText fields, OR we use a fast/simple default, OR we handle gracefully. Best approach: add authText field to the form, use the training video as authVideoUrl (same video), use cloneType="fast".

## Resolution

root_cause: handleCreateAvatar called mock createAvatar(name.trim()) which silently discards the selected videoFile. The mock creates a fake in-memory avatar with no actual upload. The real API at POST /api/avatars requires name, cloneType, videoUrl, authVideoUrl, and authText - none of which were being provided. Additionally, file input accepted "video/mp4,video/*" but the UI text incorrectly said only "MP4" was supported.

fix: |
  1. Replaced mock createAvatar import with real apiCreateAvatar + uploadFileToStorage from @/lib/api/client
  2. handleCreateAvatar now: (a) calls uploadFileToStorage(videoFile) to get a URL, (b) calls apiCreateAvatar with cloneType="fast", videoUrl, authVideoUrl=videoUrl, authText=consent phrase
  3. Added two-phase progress: submitStep state shows "上传视频中..." vs "创建数字人中..."
  4. Added submitError state with red error message display on failure
  5. handleDialogChange clears error/step state on close
  6. Updated accept attribute to include video/quicktime (MOV MIME type)
  7. Fixed UI text from "支持 MP4 格式" to "支持 MP4、MOV 等格式"
  8. Label changed from "上传视频" to "上传训练视频" for clarity

verification: TypeScript check passes with no errors in assets/page.tsx. Awaiting human E2E test.
files_changed: [apps/web/src/app/(dashboard)/assets/page.tsx]
