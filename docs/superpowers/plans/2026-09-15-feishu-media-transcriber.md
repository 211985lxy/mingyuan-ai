# Feishu Media Transcriber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit “小D” Feishu path that turns one supported public media link into a verified Feishu document containing a faithful, readable transcript purification without invoking topic, competitor, or copy generation.

**Architecture:** Keep the existing Feishu event route as the single channel entry. Add a small intent classifier, an isolated media-transcription orchestrator backed by an idempotent Prisma task record, and a prompt-registry-backed purification service; reuse the existing video extraction provider boundary and Feishu document publisher. Gate all external writes behind `FEISHU_MEDIA_TRANSCRIBER_ENABLED=true` and `executionMode === "live"`.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Vitest, Prisma 7/MySQL, AIM shared LLM gateway and Prompt Registry, `lark-cli` Feishu document/reply gateways.

## Global Constraints

- Trigger only when one supported video link and one explicit intent keyword (`小D`, `转录`, `整理`, or `提纯`) are both present.
- Explicit inspiration capture (`收选题`) keeps higher routing priority than the media transcriber.
- Messages containing only a video link retain the existing 5a–5e pipeline behavior.
- Process only the first supported link; do not add multi-link or Feishu attachment support.
- Do not claim support for the unverified WeChat Channels provider.
- Create a new Feishu document for every distinct source message; never overwrite an earlier document.
- Do not auto-publish, auto-ingest into the formal knowledge base, generate topics, analyze competitors, or generate copy.
- Do not create Feishu documents or send replies in `capture_only` or `evaluate` mode.
- Never log tokens, credentials, callback URLs, or full customer transcripts.
- No production deployment is authorized by this plan.

---

## File Structure

- Create `apps/web/src/lib/media-transcriber/intent.ts`: pure explicit-intent classifier.
- Create `apps/web/src/lib/media-transcriber/purify.ts`: prompt-registry-backed faithful purification and length safety checks.
- Create `apps/web/src/lib/media-transcriber/document.ts`: deterministic Markdown document and completion-message formatting.
- Create `apps/web/src/lib/media-transcriber/service.ts`: idempotent task orchestration, extraction, document create/read-back, and stable errors.
- Create `apps/web/__tests__/unit/media-transcriber-intent.test.ts`: routing classifier coverage.
- Create `apps/web/__tests__/unit/media-transcriber-purify.test.ts`: purification and safety fallback coverage.
- Create `apps/web/__tests__/unit/media-transcriber-service.test.ts`: orchestration, idempotency, document verification, and errors.
- Create `apps/web/__tests__/unit/feishu-media-transcriber-route.test.ts`: Feishu route precedence and reply behavior.
- Modify `apps/web/src/lib/content-pipeline/video-processor.ts`: export the existing extraction boundary without changing the 5a–5e behavior.
- Modify `apps/web/src/lib/integrations/feishu/event-replies.ts`: add small-D acknowledgement/completion/error formatters and sender.
- Modify `apps/web/src/app/api/integrations/feishu/events/route.ts`: route explicit small-D messages and schedule the background task.
- Modify `apps/web/src/lib/prompt/types.ts` and `apps/web/src/lib/prompt/seeds.ts`: register the purification prompt as a governed prompt asset.
- Modify `apps/web/src/env.ts`: declare and map the disabled-by-default feature flag and optional destination folder token.
- Modify `apps/web/prisma/content.prisma`, `apps/web/prisma/identity.prisma`, and `apps/web/prisma/profiles.prisma`: add the task model and relations.
- Create `apps/web/prisma/migrations/20260915180000_add_media_transcription_task/migration.sql`: add the production table and indexes.
- Modify `apps/web/prisma/production-schema-contract.json`: include the new production schema contract generated from the accepted Prisma schema.

---

### Task 1: Persisted Task Contract and Disabled-by-Default Configuration

**Files:**
- Modify: `apps/web/prisma/content.prisma`
- Modify: `apps/web/prisma/identity.prisma`
- Modify: `apps/web/prisma/profiles.prisma`
- Create: `apps/web/prisma/migrations/20260915180000_add_media_transcription_task/migration.sql`
- Modify: `apps/web/prisma/production-schema-contract.json`
- Modify: `apps/web/src/env.ts`
- Test: `apps/web/__tests__/unit/aim-gap-phase-a.test.ts`

**Interfaces:**
- Produces: `prisma.mediaTranscriptionTask` with unique `externalMessageId`.
- Produces: `env.FEISHU_MEDIA_TRANSCRIBER_ENABLED` and `env.FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN`.
- Consumes: existing `User`, `ClientProject`, and `ExecutionMode` string conventions.

- [ ] **Step 1: Write the failing configuration-contract test**

Add assertions to `apps/web/__tests__/unit/aim-gap-phase-a.test.ts` using the test’s existing environment mapping helper:

```ts
expect(runtimeEnv).toHaveProperty("FEISHU_MEDIA_TRANSCRIBER_ENABLED")
expect(runtimeEnv).toHaveProperty("FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN")
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/aim-gap-phase-a.test.ts
```

Expected: FAIL because the two keys are absent from the environment contract.

- [ ] **Step 3: Add the Prisma and environment contracts**

Add to `apps/web/src/env.ts` server schema and runtime mapping:

```ts
FEISHU_MEDIA_TRANSCRIBER_ENABLED: z.string().optional(),
FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN: z.string().optional(),
```

```ts
FEISHU_MEDIA_TRANSCRIBER_ENABLED: process.env.FEISHU_MEDIA_TRANSCRIBER_ENABLED,
FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN: process.env.FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN,
```

Add relations:

```prisma
// identity.prisma / User
mediaTranscriptionTasks MediaTranscriptionTask[]

// profiles.prisma / ClientProject
mediaTranscriptionTasks MediaTranscriptionTask[]
```

Add to `content.prisma`:

```prisma
model MediaTranscriptionTask {
  id                    String   @id @default(cuid())
  userId                String
  projectId             String
  externalMessageId     String   @unique @db.VarChar(191)
  externalChatId        String   @db.VarChar(191)
  sourceUrl             String   @db.VarChar(800)
  platform              String   @db.VarChar(40)
  sourceTitle           String?  @db.VarChar(500)
  status                String   @default("processing") @db.VarChar(20)
  executionModeSnapshot String   @db.VarChar(20)
  documentToken         String?  @db.VarChar(191)
  documentUrl           String?  @db.VarChar(800)
  errorCode             String?  @db.VarChar(40)
  errorMessage          String?  @db.Text
  completedAt           DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user    User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  project ClientProject @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@index([userId, createdAt(sort: Desc)])
  @@index([projectId, createdAt(sort: Desc)])
  @@index([status, updatedAt])
}
```

Create the MySQL migration with the same columns, foreign keys, unique key, and indexes. Use the repository’s existing migration naming and `ON DELETE RESTRICT ON UPDATE CASCADE` conventions. Regenerate the Prisma client and update the production schema contract through the repository’s existing schema-contract generator; do not hand-edit unrelated contract entries.

- [ ] **Step 4: Verify schema and configuration GREEN**

Run:

```bash
pnpm --filter @mingyuan/web exec prisma generate
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/aim-gap-phase-a.test.ts
pnpm --filter @mingyuan/web schema:migration-integrity
pnpm --filter @mingyuan/web typecheck
```

Expected: all commands exit 0; Prisma generates `mediaTranscriptionTask` methods.

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma apps/web/src/env.ts apps/web/__tests__/unit/aim-gap-phase-a.test.ts
git commit -m "feat(feishu): add media transcription task contract"
```

---

### Task 2: Explicit Intent and Reusable Extraction Boundary

**Files:**
- Create: `apps/web/src/lib/media-transcriber/intent.ts`
- Create: `apps/web/__tests__/unit/media-transcriber-intent.test.ts`
- Modify: `apps/web/src/lib/content-pipeline/video-processor.ts`
- Modify: `apps/web/__tests__/unit/video-processor-lark-optional.test.ts`

**Interfaces:**
- Produces: `isMediaTranscriptionIntent(text: string): boolean`.
- Produces: `extractVideoTranscript(url: string, platform: string): Promise<VideoTextExtractionResult>`.
- Preserves: `processVideo(input: VideoProcessingInput): Promise<VideoProcessingResult>` unchanged for existing callers.

- [ ] **Step 1: Write the failing intent tests**

Create `media-transcriber-intent.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { isMediaTranscriptionIntent } from "@/lib/media-transcriber/intent"

describe("isMediaTranscriptionIntent", () => {
  it.each([
    "小D，整理一下这个视频",
    "帮我转录这个内容",
    "把它整理成可读文稿",
    "请提纯这段访谈",
  ])("accepts explicit media-transcription wording: %s", (text) => {
    expect(isMediaTranscriptionIntent(text)).toBe(true)
  })

  it.each([
    "https://v.douyin.com/demo/",
    "收选题 https://v.douyin.com/demo/",
    "分析一下这个视频",
  ])("does not steal existing routes: %s", (text) => {
    expect(isMediaTranscriptionIntent(text)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the intent test and verify RED**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-intent.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure classifier and export extraction**

Create `intent.ts`:

```ts
const MEDIA_TRANSCRIPTION_PATTERN = /(?:小\s*[dD]|转录|整理(?:一下|成)?|提纯)/u

export function isMediaTranscriptionIntent(text: string): boolean {
  return MEDIA_TRANSCRIPTION_PATTERN.test(text.trim())
}
```

Change only the visibility of the existing extractor in `video-processor.ts`:

```ts
export async function extractVideoTranscript(
  url: string,
  platform: string,
): Promise<VideoTextExtractionResult> {
  // keep the existing body byte-for-byte
}
```

Add a focused assertion to the existing processor test that imports and invokes the exported function with the current provider mock; do not duplicate provider polling logic.

- [ ] **Step 4: Verify GREEN and existing behavior**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-intent.test.ts __tests__/unit/video-processor-lark-optional.test.ts __tests__/unit/video-processor-summary-route.test.ts
```

Expected: all focused tests pass and the ordinary `processVideo` behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/media-transcriber/intent.ts apps/web/src/lib/content-pipeline/video-processor.ts apps/web/__tests__/unit/media-transcriber-intent.test.ts apps/web/__tests__/unit/video-processor-lark-optional.test.ts
git commit -m "refactor(video): expose transcript extraction boundary"
```

---

### Task 3: Governed Sharing-Style Purification

**Files:**
- Modify: `apps/web/src/lib/prompt/types.ts`
- Modify: `apps/web/src/lib/prompt/seeds.ts`
- Create: `apps/web/src/lib/media-transcriber/purify.ts`
- Create: `apps/web/__tests__/unit/media-transcriber-purify.test.ts`

**Interfaces:**
- Produces: `PROMPT_KEYS.mediaTranscriptPurify`.
- Produces: `purifyMediaTranscript(input, deps?): Promise<PurifiedTranscript>`.
- `PurifiedTranscript`: `{ markdown: string; usedFallback: boolean }`.

- [ ] **Step 1: Write failing purification tests**

Create a fake completion dependency so the tests exercise real safety checks without calling an external model:

```ts
import { describe, expect, it, vi } from "vitest"
import { purifyMediaTranscript } from "@/lib/media-transcriber/purify"

describe("purifyMediaTranscript", () => {
  const source = "王老师说，门店从12家增长到27家。随后他讲了杭州门店连续三个月复购提升的案例。".repeat(12)

  it("returns a faithful long-form result when the model preserves evidence", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: `## 业务增长\n\n${source}`,
    })
    const result = await purifyMediaTranscript({ title: "访谈", transcript: source }, { complete })
    expect(result.markdown).toContain("12家")
    expect(result.markdown).toContain("27家")
    expect(result.markdown).toContain("杭州门店")
    expect(result.usedFallback).toBe(false)
  })

  it("falls back to the polished transcript when the result is an abnormal summary", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "三点启发：坚持、努力、复盘。" })
    const result = await purifyMediaTranscript({ title: "访谈", transcript: source }, { complete })
    expect(result.markdown).toBe(source)
    expect(result.usedFallback).toBe(true)
  })
})
```

- [ ] **Step 2: Run the purification test and verify RED**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-purify.test.ts
```

Expected: FAIL because the purifier and prompt key do not exist.

- [ ] **Step 3: Register the prompt and implement the safety boundary**

Add to `PROMPT_KEYS`:

```ts
mediaTranscriptPurify: "media.transcript.purify",
```

Add an active seed fallback to `seeds.ts`:

```ts
{
  key: PROMPT_KEYS.mediaTranscriptPurify,
  domain: "media",
  description: "音视频分享式提纯，忠实保留判断、案例和数字",
  version: 1,
  type: "system",
  content: [
    "你负责把音视频转录稿整理成可读的中文分享式文稿，而不是摘要。",
    "删除时间戳、寒暄、口水话、重复和残句；修正有把握的明显错词。",
    "忠实保留原意、关键判断、论证、案例、数字和重要表达。",
    "按少量真实主题增加 Markdown 小标题。",
    "不得新增事实、外推结论、改写成营销文案，也不得输出三点启发式摘要。",
    "只输出整理后的正文。",
  ].join("\n"),
},
```

Implement `purify.ts` with dependency injection and a strict length guard:

```ts
import { createGatewayLLM } from "@/lib/llm/gateway-client"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"

const MIN_RETENTION_RATIO = 0.45

export interface PurifiedTranscript {
  markdown: string
  usedFallback: boolean
}

export async function purifyMediaTranscript(
  input: { title?: string; transcript: string },
  deps: { complete?: (messages: ReturnType<typeof promptRegistry.getMessages>) => Promise<{ content: string }> } = {},
): Promise<PurifiedTranscript> {
  const source = input.transcript.trim()
  if (!source) throw new Error("EMPTY_TRANSCRIPT")
  const messages = promptRegistry.getMessages(
    PROMPT_KEYS.mediaTranscriptPurify,
    `素材标题：${input.title || "未知"}\n\n转录稿：\n${source}`,
  )
  const complete = deps.complete ?? (async (promptMessages) => {
    const llm = createGatewayLLM()
    if (!llm.available) throw new Error("PURIFICATION_FAILED")
    return llm.complete({
      model: process.env.SCRIPT_GENERATION_MODEL || "claude-sonnet-4-6",
      messages: promptMessages,
      temperature: 0.1,
      maxTokens: 12_000,
    })
  })
  const output = (await complete(messages)).content.trim()
  if (!output || output.length < Math.floor(source.length * MIN_RETENTION_RATIO)) {
    return { markdown: source, usedFallback: true }
  }
  return { markdown: output, usedFallback: false }
}
```

If the repository’s model constant differs, import the existing shared model constant rather than hard-coding a new provider model. Keep this file under 200 lines; reuse `splitTranscriptChunks` if the first test fixture shows the gateway input limit is exceeded.

- [ ] **Step 4: Verify GREEN and prompt registration**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-purify.test.ts __tests__/unit/prompt-registry.test.ts
pnpm --filter @mingyuan/web typecheck
```

Expected: all tests pass; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/prompt apps/web/src/lib/media-transcriber/purify.ts apps/web/__tests__/unit/media-transcriber-purify.test.ts
git commit -m "feat(feishu): add faithful transcript purification"
```

---

### Task 4: Idempotent Orchestration and Verified Document Delivery

**Files:**
- Create: `apps/web/src/lib/media-transcriber/document.ts`
- Create: `apps/web/src/lib/media-transcriber/service.ts`
- Create: `apps/web/__tests__/unit/media-transcriber-service.test.ts`

**Interfaces:**
- Consumes: `extractVideoTranscript`, `purifyMediaTranscript`, `createFeishuDoc`, `fetchFeishuDoc`, and `prisma.mediaTranscriptionTask`.
- Produces: `runMediaTranscriptionTask(input, deps?): Promise<MediaTranscriptionResult>`.
- Produces: stable error codes `UNSUPPORTED_LINK | EXTRACTION_FAILED | EMPTY_TRANSCRIPT | PURIFICATION_FAILED | DOC_CREATE_FAILED | DOC_VERIFY_FAILED | PROJECT_UNBOUND`.

- [ ] **Step 1: Write failing orchestration tests**

Cover successful create/read-back, completed duplicate reuse, processing duplicate suppression, and failed read-back. The success test must assert that no topic/copy service is present in the dependency contract:

```ts
it("creates and verifies one document for one external message", async () => {
  const result = await runMediaTranscriptionTask(INPUT, deps)
  expect(deps.extract).toHaveBeenCalledTimes(1)
  expect(deps.createDoc).toHaveBeenCalledWith(expect.objectContaining({
    title: "【小D整理】门店经营访谈",
    content: expect.stringContaining("原始链接"),
  }))
  expect(deps.fetchDoc).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1" }))
  expect(result).toEqual(expect.objectContaining({
    status: "completed",
    documentUrl: "https://feishu.cn/docx/doc-1",
  }))
})

it("reuses the saved document for a replayed completed message", async () => {
  deps.findTask.mockResolvedValue({ status: "completed", documentToken: "doc-1", documentUrl: "https://feishu.cn/docx/doc-1" })
  const result = await runMediaTranscriptionTask(INPUT, deps)
  expect(result.status).toBe("duplicate")
  expect(deps.extract).not.toHaveBeenCalled()
  expect(deps.createDoc).not.toHaveBeenCalled()
})

it("does not report completion when document read-back is empty", async () => {
  deps.fetchDoc.mockResolvedValue({ token: "doc-1", title: "", content: "" })
  await expect(runMediaTranscriptionTask(INPUT, deps)).rejects.toMatchObject({ code: "DOC_VERIFY_FAILED" })
})
```

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-service.test.ts
```

Expected: FAIL because `document.ts` and `service.ts` do not exist.

- [ ] **Step 3: Implement deterministic document formatting**

Create `document.ts`:

```ts
export function buildMediaTranscriptionDocument(input: {
  title: string
  platform: string
  sourceUrl: string
  purifiedMarkdown: string
}): { title: string; content: string } {
  return {
    title: `【小D整理】${input.title}`,
    content: [
      `# ${input.title}`,
      "",
      `- 来源平台：${input.platform}`,
      `- 原始链接：${input.sourceUrl}`,
      "",
      "> 以下内容由音视频自动转录并进行忠实整理，不是摘要或再创作文案。",
      "",
      input.purifiedMarkdown,
      "",
      "---",
      "本稿由音视频自动转录整理，涉及人名、数字和关键事实时请回看原素材核对。",
    ].join("\n"),
  }
}
```

- [ ] **Step 4: Implement the task state machine**

Create a typed `MediaTranscriberError` and `runMediaTranscriptionTask`. Resolve the platform with `detectVideoPlatform`, atomically create the task by unique `externalMessageId`, and handle Prisma unique-conflict by reading the existing row. Never store the full transcript or purified body in the task row.

The core sequence must remain:

```ts
const extraction = await deps.extract(input.sourceUrl, platform)
if (!extraction.transcript?.trim()) throw new MediaTranscriberError("EMPTY_TRANSCRIPT", "没有识别到有效文字。")
const purified = await deps.purify({ title: extraction.title, transcript: extraction.transcript })
const document = buildMediaTranscriptionDocument({
  title: extraction.title || "未命名音视频",
  platform,
  sourceUrl: input.sourceUrl,
  purifiedMarkdown: purified.markdown,
})
const created = await deps.createDoc({
  ...document,
  folderToken: input.folderToken,
})
const verified = await deps.fetchDoc({ documentId: created.token })
if (!verified.title.trim() || !verified.content.trim()) {
  throw new MediaTranscriberError("DOC_VERIFY_FAILED", "飞书文档已创建，但回读校验失败。")
}
```

In the catch path, update the task to `failed` with only `errorCode` and a safe message, then rethrow the typed error. In the completed path, save `sourceTitle`, `documentToken`, `documentUrl`, and `completedAt`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/media-transcriber-service.test.ts
pnpm --filter @mingyuan/web typecheck:tests
```

Expected: orchestration tests pass; test typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/media-transcriber apps/web/__tests__/unit/media-transcriber-service.test.ts
git commit -m "feat(feishu): orchestrate verified transcript documents"
```

---

### Task 5: Feishu Route Precedence and Thread Replies

**Files:**
- Modify: `apps/web/src/lib/integrations/feishu/event-replies.ts`
- Modify: `apps/web/src/app/api/integrations/feishu/events/route.ts`
- Create: `apps/web/__tests__/unit/feishu-media-transcriber-route.test.ts`
- Modify: `apps/web/__tests__/unit/feishu-topic-chat.test.ts`

**Interfaces:**
- Consumes: `isMediaTranscriptionIntent`, `runMediaTranscriptionTask`, `resolveBindingExecutionMode`, and existing link detection.
- Produces: one acknowledgement and one final reply using deterministic idempotency keys derived from `messageId`.
- Preserves: inspiration capture, ordinary video processing, AIM chat, and generic inspiration routing.

- [ ] **Step 1: Write failing route-precedence tests**

Mock external boundaries and assert the routing matrix:

```ts
it("routes an explicit 小D link to the media transcriber", async () => {
  const response = await POST(feishuEvent("小D，整理一下 https://v.douyin.com/demo/"))
  expect(response.status).toBe(200)
  expect(mocks.runMediaTranscriptionTask).toHaveBeenCalledTimes(1)
  expect(mocks.processVideo).not.toHaveBeenCalled()
})

it("keeps a plain video link on the existing pipeline", async () => {
  await POST(feishuEvent("https://v.douyin.com/demo/"))
  expect(mocks.processVideo).toHaveBeenCalledTimes(1)
  expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
})

it("keeps 收选题 ahead of 小D routing", async () => {
  await POST(feishuEvent("小D 收选题 https://v.douyin.com/demo/"))
  expect(mocks.ingestInspirationEvent).toHaveBeenCalledTimes(1)
  expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
})

it.each(["capture_only", "evaluate"])("suppresses document work in %s", async (mode) => {
  mocks.resolveBindingExecutionMode.mockReturnValue(mode)
  await POST(feishuEvent("小D，整理一下 https://v.douyin.com/demo/"))
  expect(mocks.runMediaTranscriptionTask).not.toHaveBeenCalled()
  expect(mocks.replyFeishuTextMessage).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/feishu-media-transcriber-route.test.ts
```

Expected: FAIL because the route has no small-D branch.

- [ ] **Step 3: Add reply formatters**

Add to `event-replies.ts`:

```ts
export const MEDIA_TRANSCRIBER_ACCEPTED_REPLY =
  "已收到，正在转录并整理为可读文稿。完成后我会把飞书文档发在这里。"

export function buildMediaTranscriberCompletedReply(result: {
  title: string
  platform: string
  documentUrl: string
}): string {
  return [
    "✅ 小D整理完成",
    `标题：${result.title}`,
    `来源：${result.platform}`,
    `完整文稿：${result.documentUrl}`,
    "涉及人名、数字和关键事实时，请回看原素材核对。",
  ].join("\n")
}
```

Use the existing tenant-token and `replyFeishuTextMessage` boundary for final success/error replies. Use `media-transcriber:accepted:${messageId}` and `media-transcriber:final:${messageId}` as logical keys; rely on the existing `toFeishuReplyUuid` normalization for Feishu’s 50-character maximum.

- [ ] **Step 4: Integrate the route behind the feature flag**

Before the ordinary video branch, after explicit inspiration precedence is known, add:

```ts
const mediaTranscriberRequested =
  env.FEISHU_MEDIA_TRANSCRIBER_ENABLED === "true"
  && !captureFromAimChat
  && linkDetection.hasLinks
  && isMediaTranscriptionIntent(event.text)

if (mediaTranscriberRequested) {
  const mode = resolveBindingExecutionMode(binding)
  if (isReplySuppressed(mode)) {
    return { ok: true, routed: "media_transcriber", suppressed: true }
  }
  await sendImmediateFeishuReply(event.messageId, MEDIA_TRANSCRIBER_ACCEPTED_REPLY)
  after(async () => {
    try {
      const completed = await runMediaTranscriptionTask({
        externalMessageId: event.messageId,
        externalChatId: event.chatId,
        userId: binding.userId,
        projectId: binding.projectId,
        sourceUrl: linkDetection.links[0].url,
        executionMode: mode,
        folderToken: env.FEISHU_MEDIA_TRANSCRIBER_FOLDER_TOKEN,
      })
      await sendMediaTranscriberFinalReply(event.messageId, completed)
    } catch (error) {
      await sendMediaTranscriberErrorReply(event.messageId, error)
    }
  })
  return { ok: true, routed: "media_transcriber" }
}
```

Import `after` from `next/server`. If the route-test runtime cannot invoke `after`, inject or mock it using the project’s existing Next.js test pattern; do not revert to an untracked floating promise.

- [ ] **Step 5: Verify GREEN and route regressions**

Run:

```bash
pnpm --filter @mingyuan/web test:unit -- __tests__/unit/feishu-media-transcriber-route.test.ts __tests__/unit/feishu-topic-chat.test.ts __tests__/unit/inspiration-events.test.ts
pnpm --filter @mingyuan/web typecheck:tests
```

Expected: all focused route and regression tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/integrations/feishu/events/route.ts apps/web/src/lib/integrations/feishu/event-replies.ts apps/web/__tests__/unit/feishu-media-transcriber-route.test.ts apps/web/__tests__/unit/feishu-topic-chat.test.ts
git commit -m "feat(feishu): route explicit media transcription requests"
```

---

### Task 6: Full Verification and Controlled Live-Fire Acceptance

**Files:**
- Modify only if a factual gap is found: `docs/superpowers/specs/2026-09-15-feishu-media-transcriber-design.md`
- Record non-secret evidence outside committed source if the repository’s existing acceptance-evidence convention requires it.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence separated into code, build, integration, and production states.

- [ ] **Step 1: Run focused unit coverage**

```bash
pnpm --filter @mingyuan/web test:unit -- \
  __tests__/unit/media-transcriber-intent.test.ts \
  __tests__/unit/media-transcriber-purify.test.ts \
  __tests__/unit/media-transcriber-service.test.ts \
  __tests__/unit/feishu-media-transcriber-route.test.ts \
  __tests__/unit/video-processor-lark-optional.test.ts \
  __tests__/unit/video-processor-summary-route.test.ts \
  __tests__/unit/feishu-topic-chat.test.ts
```

Expected: all tests pass with 0 failures.

- [ ] **Step 2: Run repository gates**

```bash
pnpm --filter @mingyuan/web typecheck
pnpm --filter @mingyuan/web typecheck:tests
pnpm --filter @mingyuan/web lint
pnpm --filter @mingyuan/web arch:size
pnpm --filter @mingyuan/web schema:migration-integrity
pnpm --filter @mingyuan/web build
```

Expected: every command exits 0. Any pre-existing unrelated failure must be reported with its exact command and must not be described as feature success.

- [ ] **Step 3: Review the complete diff**

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Verify every changed line maps to the approved design and no environment secret, token, generated credential, customer transcript, deployment file, or unrelated formatting change is present.

- [ ] **Step 4: Commit verification-only corrections if required**

If verification required code corrections, repeat the failing test first and commit only those corrections:

```bash
git add apps/web/src apps/web/__tests__ apps/web/prisma
git commit -m "fix(feishu): close media transcriber verification gaps"
```

If no correction is needed, do not create an empty commit.

- [ ] **Step 5: Prepare but do not execute production deployment**

Confirm the feature remains disabled unless explicitly configured:

```bash
rg -n "FEISHU_MEDIA_TRANSCRIBER_ENABLED" apps/web/src/env.ts apps/web/src/app/api/integrations/feishu/events/route.ts
```

Expected: the route requires the exact value `"true"`; no production configuration has been changed.

- [ ] **Step 6: Run controlled Feishu integration only after the user identifies the test chat and public media URL**

In a non-production or explicitly approved test environment:

1. Set `FEISHU_MEDIA_TRANSCRIBER_ENABLED=true` and a test-folder token through the existing secret/configuration mechanism; never print their values.
2. Send `小D，整理一下` followed by the user-approved public video URL in the bound test chat.
3. Verify the immediate acknowledgement appears in the source message thread.
4. Wait for the final reply and open its Feishu document.
5. Fetch the created document through the existing read-back gateway and confirm the title, original URL, platform, body, and warning line are present.
6. Compare at least three source facts, including every available number and named case, against the original video.
7. Replay the same captured Feishu event once and confirm no second document is created.
8. Restore the test feature flag to disabled after acceptance unless the user separately approves rollout.

Expected: integration evidence is green while production remains unchanged.

- [ ] **Step 7: Final status report**

Report four states separately:

- Code: commit SHA and automated gates.
- Build: production build result.
- Integration: exact test chat/sample outcome and document read-back result.
- Production: `not deployed` unless a later explicit approval and release gate complete.

---

## Plan Self-Review

- Spec coverage: explicit routing, precedence, extraction reuse, faithful purification, verified new document, persisted idempotency, execution-mode suppression, stable errors, and live-fire acceptance each map to a task.
- Scope: one independently testable Feishu media-transcription work package; attachments, multiple links, automatic knowledge ingestion, and deployment remain excluded.
- Type consistency: `externalMessageId`, `documentToken`, `documentUrl`, `MediaTranscriptionResult`, and the seven stable error codes use the same names across schema, service, route, and tests.
- Safety: external writes are double-gated by an explicit feature flag and live execution mode; production remains disabled.
