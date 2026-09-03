# AIM Normal Conversation Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AIM 的长篇日常讨论正常进入回复路径，并让普通回复理解最近对话、当前作品和参考材料；明确创作请求继续进入内容工作流。

**Architecture:** 保留现有 `respond | deliver | clarify` 语义协议，只移除基于字符数直接判定 `deliver` 的错误快速路径。普通回复继续走现有统一回复与语义验收循环，但在用户提示中加入来源分明的上下文块。

**Tech Stack:** TypeScript、Next.js、Vitest、现有 AIM source envelope 与统一内容执行服务。

## Global Constraints

- 当前用户原话是唯一最高真源。
- 日常讨论、解释、评价、确认需求和追问原因直接回答。
- 只有明确要求写作、改写、编辑或生成作品时进入交付流程。
- 不新增 Agent、数据库字段、前端页面或关键词分类体系。
- 不修改岗位卡和 Skill 职责。

---

### Task 1: Remove the message-length delivery shortcut

**Files:**
- Modify: `apps/web/src/lib/aim/semantic-task-understanding.ts`
- Test: `apps/web/__tests__/unit/aim-generate-latency-fix.test.ts`

**Interfaces:**
- Consumes: `AimContentSourceEnvelope.currentUserRequest` and the existing explicit creation/analysis patterns.
- Produces: `resolveSemanticUnderstandingFastPath(envelope): AimSemanticTaskUnderstanding | null`; ordinary long discussion returns `null`, explicit creation returns `deliver`, analysis questions return `respond`.

- [ ] **Step 1: Write the failing regression test**

Add a test whose request exceeds 120 characters but only discusses the workflow:

```ts
it("does not treat a long ordinary discussion as a delivery request", () => {
  const request = "我觉得这里被工作流限制得太严重了。用户只是在讨论岗位之间如何配合，并没有要求生成文案，也没有要求改写作品。系统应该先听懂当前问题并正常交流，不应该因为输入内容比较长，就自动要求填写目标用户、内容目标和任务卡。这样日常沟通才不会一直被创作流程打断。"

  expect(resolveSemanticUnderstandingFastPath({
    currentUserRequest: request,
    relevantConversation: [],
    referenceMaterials: [],
  })).toBeNull()
})
```

- [ ] **Step 2: Run the regression test and verify RED**

Run:

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/aim-generate-latency-fix.test.ts
```

Expected: the new test fails because the current implementation returns `{ handling: "deliver" }` for a request longer than 120 characters.

- [ ] **Step 3: Implement the minimal routing change**

Delete the `materialChars` calculation and the entire length-based `deliver` branch from `resolveSemanticUnderstandingFastPath`. Leave explicit creation and analysis-question behavior unchanged; otherwise return `null` so the semantic understanding model decides.

- [ ] **Step 4: Run the routing test and verify GREEN**

Run the same Vitest command. Expected: all tests in `aim-generate-latency-fix.test.ts` pass.

- [ ] **Step 5: Commit the routing fix**

```bash
git add apps/web/src/lib/aim/semantic-task-understanding.ts apps/web/__tests__/unit/aim-generate-latency-fix.test.ts
git commit -m "fix(aim): keep ordinary discussion out of delivery flow"
```

### Task 2: Include bounded source-envelope context in normal replies

**Files:**
- Modify: `apps/web/src/lib/aim/services/unified-content-execution.ts`
- Test: `apps/web/__tests__/unit/aim-unified-content-execution.test.ts`

**Interfaces:**
- Consumes: `sourceEnvelope.currentUserRequest`, `relevantConversation`, `currentArtifact`, and `referenceMaterials`.
- Produces: the existing `executeVerifiedUnifiedReply(...) => Promise<string>` behavior, with a source-separated prompt passed to its completion port.

- [ ] **Step 1: Write the failing prompt-context test**

Extend the successful reply test with one recent user turn and one reference material, then assert the completion prompt contains all source blocks:

```ts
expect(complete.mock.calls[0]?.[1]).toContain("【最近相关对话】")
expect(complete.mock.calls[0]?.[1]).toContain("用户：我们刚才在讨论编辑官流程")
expect(complete.mock.calls[0]?.[1]).toContain("【当前作品】")
expect(complete.mock.calls[0]?.[1]).toContain("【参考材料：岗位卡】")
```

- [ ] **Step 2: Run the reply test and verify RED**

Run:

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/aim-unified-content-execution.test.ts
```

Expected: assertions for recent conversation and reference material fail because the existing prompt only includes the current request, temporary understanding, and current artifact.

- [ ] **Step 3: Implement source-separated reply context**

Build bounded strings from the source envelope already prepared upstream:

```ts
const conversation = input.parsed.sourceEnvelope.relevantConversation
  .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`)
  .join("\n\n")
const references = input.parsed.sourceEnvelope.referenceMaterials
  .map((item) => `【参考材料：${item.title}】\n${item.content}`)
  .join("\n\n")
```

Insert `【最近相关对话】`, `【当前作品】`, and reference blocks after the current user request while retaining `【临时任务理解】`. Do not add another fetch, database read, or new truncation policy because the source envelope is already bounded upstream.

- [ ] **Step 4: Run the reply test and verify GREEN**

Run the same Vitest command. Expected: all tests in `aim-unified-content-execution.test.ts` pass.

- [ ] **Step 5: Run focused regression verification**

```bash
cd apps/web
pnpm exec vitest run __tests__/unit/aim-generate-latency-fix.test.ts __tests__/unit/aim-unified-content-execution.test.ts
pnpm typecheck
pnpm arch:size
```

Expected: focused tests, TypeScript checking, and architecture size gate all exit with code 0.

- [ ] **Step 6: Commit the context fix**

```bash
git add apps/web/src/lib/aim/services/unified-content-execution.ts apps/web/__tests__/unit/aim-unified-content-execution.test.ts
git commit -m "fix(aim): include conversation context in normal replies"
```
