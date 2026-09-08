# AIM 创作工作页（/aim）体验升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对照智能体工作台参考设计，修复并升级 /aim 创作工作页的六个体验点：思考过程 trace 链路（P0 bug）、可点击阶段条、显性「先确认再生成」开关、空状态快捷指令、顶部横幅合并、交付物导出 Markdown。

**Architecture:** 全部改动在 `apps/web`（Next.js App Router + React + Tailwind）。Task 1 同时触服务端（API route + zod 契约），其余为纯前端。类型从 zod schema 派生（`AimExecuteRequest = z.infer<aimExecuteBodySchema>`），改 schema 即更新客户端类型，无需改 `src/lib/api/aim.ts`。

**Tech Stack:** Next.js / React / Tailwind / zod / vitest（unit：node 环境 `vitest.config.ts`；component：jsdom 环境 `vitest.component.config.ts`）/ @testing-library/react + userEvent。

## Global Constraints

- 所有改动与提交都在 `mingyuan/` 子仓库内；根工作区仓库禁止提交产品代码。
- 组件/函数 ≤80 行（`pnpm longfn:check` 护栏）；新文件注意 `pnpm arch:size`。
- 专家能力判断必须走 `src/lib/aim/agent-capabilities.ts` 矩阵，禁止页面散落 `agentId === "…"`。
- 单元测试：`cd apps/web && pnpm test <path>`（node 环境）；组件测试：`cd apps/web && pnpm test:component <path>`（jsdom 环境）。
- 每个任务提交前跑 `cd apps/web && pnpm typecheck`。
- Commit message 用 Conventional Commits + 中文描述（如 `fix(aim): …`、`feat(aim): …`）。
- 文案用中文、口语、面向老板用户；按钮文案 ≤8 字。

## 背景：Task 1 的 bug 证据

- 客户端在 `src/hooks/use-aim-generation-actions.ts:273` 生成 `traceId = crypto.randomUUID()` 并挂到占位消息上，但 `buildGenerationRequest`（同文件 :169）和 `buildExecuteTurnRequest`（`src/hooks/aim-generation-delivery-flow.ts:38`）**都没有把 traceId 放进请求体**。
- 服务端 `/api/aim/generate` 经 `prepareAimGenerateRequest`（`src/lib/aim/services/generate-request.ts:34-35`）支持 `body.traceId`；schema `aimGenerateBodyObjectSchema`（`src/features/aim/contracts/api.ts:128`）也已有 `traceId: optionalId`。但客户端不发，等于空着。
- 服务端 `/api/aim/execute` 的 schema 是 `.strict()` 且**没有** traceId 字段（contracts/api.ts:99），route 里 `createAimTrace`（execute/route.ts:34）不传 id，服务端自造一个 UUID。
- 结果：`ThinkingProcessPanel` 拿客户端 UUID 去连 `/api/aim/trace/{traceId}`，route 里 `findFirst({ id: traceId, userId, projectId })` 查不到 → 404 → `es.onerror` 直接 `setIsComplete(true)`（thinking-process-panel.tsx 约 :320-326）。**主生成流程的实时思考面板从未真正工作过**，用户只能看到 12s/28s/55s 轮换的假进度文案。

---

### Task 1: 修复思考过程 trace 链路（P0）

**Files:**
- Modify: `apps/web/src/features/aim/contracts/api.ts:99-107`（aimExecuteBodySchema 加 traceId）
- Modify: `apps/web/src/app/api/aim/execute/route.ts:34-40`（createAimTrace 传客户端 id）
- Modify: `apps/web/src/hooks/aim-generation-delivery-flow.ts:30-35, 38-66`（options 加 traceId，请求体带 traceId）
- Modify: `apps/web/src/hooks/use-aim-generation-actions.ts:95-103, 169-226, 269-298`（GenerateOptions 加 traceId、buildGenerationRequest 返回体带 traceId、executeGeneration 调用处传入）
- Test: `apps/web/__tests__/unit/aim-execute-trace-id.test.ts`（新建）

**Interfaces:**
- Consumes: `createAimTrace` 已支持 `input.id`（`src/lib/aim-observability.ts:123-143`）；`aimGenerateBodyObjectSchema` 已有 `traceId: optionalId`。
- Produces: `buildExecuteTurnRequest(input, rawInput, currentInput, baseMessages, options)` 返回体新增 `traceId?: string`；`aimExecuteBodySchema` 接受可选 `traceId`；客户端每次生成都把同一 UUID 同时用于消息占位与请求体。

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/__tests__/unit/aim-execute-trace-id.test.ts`：

```ts
import { describe, expect, it } from "vitest"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { buildExecuteTurnRequest } from "@/hooks/aim-generation-delivery-flow"

function mockInput() {
  return {
    selectedAgentId: "content_producer",
    projectEnabled: false,
    selectedProjectId: "",
    agent: { defaultFormats: ["raw_copy"] },
    selectedMethodologyProfileIds: [],
    editorText: "",
    editorFormat: undefined,
    sourceOriginalText: "",
    sourceAnalysisText: "",
  } as unknown as Parameters<typeof buildExecuteTurnRequest>[0]
}

describe("execute 入口 traceId 透传", () => {
  it("buildExecuteTurnRequest 把 options.traceId 放进请求体，且通过服务端 schema 校验", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {
      traceId: "trace-test-123",
    })
    expect(body).toMatchObject({ traceId: "trace-test-123" })
    const parsed = aimExecuteBodySchema.parse(body)
    expect(parsed.traceId).toBe("trace-test-123")
  })

  it("不传 traceId 时 schema 依然通过", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {})
    const parsed = aimExecuteBodySchema.parse(body)
    expect(parsed.traceId).toBeUndefined()
  })

  it("strict schema 仍拒绝未知字段", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {})
    expect(() => aimExecuteBodySchema.parse({ ...body, hacker: 1 })).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test __tests__/unit/aim-execute-trace-id.test.ts`
Expected: FAIL —— `toMatchObject({ traceId: "trace-test-123" })` 失败（请求体无此字段），schema parse 因 `.strict()` 拒绝 traceId 而 throw。

- [ ] **Step 3: 实现**

3a. `apps/web/src/features/aim/contracts/api.ts`，`aimExecuteBodySchema`（:99-107）加一行：

```ts
export const aimExecuteBodySchema = z.object({
  agentId: z.string().max(80).optional(),
  executionAgentId: z.string().max(80).optional(),
  projectId: optionalId,
  sourceEnvelope: contentSourceEnvelopeSchema,
  targetFormats: z.array(contentFormatSchema).min(1).max(8),
  methodologyProfileIds: methodologyProfileIdsSchema,
  activeMethodologySignals: activeMethodologySignalsSchema,
  traceId: optionalId,
}).strict()
```

3b. `apps/web/src/app/api/aim/execute/route.ts`（:34-40），`createAimTrace` 传入客户端 id（对齐 `generate-request.ts:35` 的写法）：

```ts
    trace = await createAimTrace({
      id: typeof scopedParsed.traceId === "string" ? scopedParsed.traceId.trim() || undefined : undefined,
      userId: user.id,
      projectId: boundProject.id,
      agentId,
      action: "generate",
      inputSummary: scopedParsed.sourceEnvelope.currentUserRequest,
    })
```

3c. `apps/web/src/hooks/aim-generation-delivery-flow.ts`：

`AimExecuteTurnRequestOptions`（:30-35）加字段：

```ts
export interface AimExecuteTurnRequestOptions {
  startsNewTask?: boolean
  executionAgentId?: string
  /** 客户端生成的追踪 ID：与占位消息上的 traceId 一致，供思考过程面板 SSE 订阅 */
  traceId?: string
  /** 方法论类技能一次性透传：本轮触发对应方法论/爆款结构注入 */
  activeMethodologySignals?: import("@/lib/aim-agent-guides").AimMethodologySignal[]
}
```

`buildExecuteTurnRequest` 返回对象（:57-66）加一行：

```ts
  return {
    agentId: input.selectedAgentId,
    executionAgentId: options.executionAgentId,
    projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    sourceEnvelope,
    targetFormats: input.agent.defaultFormats,
    traceId: options.traceId,
    // 方法论是当前控件偏好，不是上一任务正文；新任务仍可带上用户已选卡片
    methodologyProfileIds: input.selectedMethodologyProfileIds?.length ? input.selectedMethodologyProfileIds : undefined,
    activeMethodologySignals: options.activeMethodologySignals?.length ? options.activeMethodologySignals : undefined,
  }
```

3d. `apps/web/src/hooks/use-aim-generation-actions.ts`：

`GenerateOptions`（:95-103）加字段：

```ts
  /** 客户端生成的追踪 ID：与占位消息上的 traceId 一致 */
  traceId?: string
```

`buildGenerationRequest` 返回对象（:195-225）加一行（放在 `executionAgentId` 之前即可）：

```ts
    traceId: options.traceId,
```

`executeGeneration`（:269-298）两处调用点传入 traceId（traceId 在 :273 已生成，位于两个调用点之前，顺序无需调整）：

```ts
    const request = buildGenerationRequest(input, rawInput, currentInput, baseMessages, { ...options, traceId })
    // …
      const executeBody = buildExecuteTurnRequest(input, rawInput, currentInput, baseMessages, { ...options, traceId })
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test __tests__/unit/aim-execute-trace-id.test.ts && pnpm test __tests__/unit/aim-message-stream.test.ts && pnpm typecheck`
Expected: 全部 PASS，typecheck 无错。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/features/aim/contracts/api.ts apps/web/src/app/api/aim/execute/route.ts apps/web/src/hooks/aim-generation-delivery-flow.ts apps/web/src/hooks/use-aim-generation-actions.ts apps/web/__tests__/unit/aim-execute-trace-id.test.ts
git commit -m "fix(aim): 生成请求透传客户端 traceId，接通思考过程实时面板"
```

---

### Task 2: 阶段条激活为可点击导航

**Files:**
- Modify: `apps/web/src/components/aim/aim-workbench-header.tsx:11-22, 52-73, 100-167`
- Test: `apps/web/__tests__/components/aim-workbench-header.test.tsx`（新建）

**Interfaces:**
- Consumes: `page.tsx:293` 已经传了 `onStageChange={w.beginWorkflowStage}`；`beginWorkflowStage`（`src/hooks/use-aim-workflow-actions.ts:48-58`）负责切 agent + 写 URL `?stage=`，无需改动。
- Produces: `AimWorkbenchHeaderProps.onStageChange` 摘掉 @deprecated；非当前阶段渲染为 `button`，aria-label 为 `切换到{阶段名}`。

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/__tests__/components/aim-workbench-header.test.tsx`：

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimWorkbenchHeader } from "@/components/aim/aim-workbench-header"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimWorkbenchHeader>> = {}) {
  return {
    workflowStage: "content" as const,
    agentTitle: "内容创作",
    AgentIcon: () => <span data-testid="agent-icon" />,
    showStageProgress: true,
    onStageChange: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }
}

describe("AimWorkbenchHeader 阶段条", () => {
  it("点击非当前阶段触发 onStageChange", async () => {
    const user = userEvent.setup()
    const onStageChange = vi.fn()
    render(<AimWorkbenchHeader {...baseProps({ onStageChange })} />)

    await user.click(screen.getByRole("button", { name: "切换到发作品" }))
    expect(onStageChange).toHaveBeenCalledWith("publish")
  })

  it("当前阶段不作为按钮渲染，且带 aria-current=step", () => {
    render(<AimWorkbenchHeader {...baseProps()} />)

    expect(screen.queryByRole("button", { name: "切换到做内容" })).toBeNull()
    expect(screen.getByText("做内容").closest("[aria-current='step']")).toBeTruthy()
  })

  it("不传 onStageChange 时所有阶段均为只读", () => {
    render(<AimWorkbenchHeader {...baseProps({ onStageChange: undefined })} />)

    expect(screen.queryByRole("button", { name: /切换到/ })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-workbench-header.test.tsx`
Expected: FAIL —— 找不到名为「切换到发作品」的 button。

- [ ] **Step 3: 实现**

3a. `AimWorkbenchHeaderProps`（:11-22）更新注释、摘掉 deprecated：

```ts
export interface AimWorkbenchHeaderProps {
  workflowStage: AimWorkflowStage
  agentTitle: string
  AgentIcon: ComponentType<{ className?: string }>
  /** 空状态（未开始任务）时不展示完整四阶段步骤条，避免与正文快捷入口重复 */
  showStageProgress: boolean
  /** 点击非当前阶段时切换工作流阶段（同时切到该阶段默认专家并写回 URL） */
  onStageChange?: (stage: AimWorkflowStage) => void
  /** 当前登录账号绑定的项目名称；只读展示，不提供切换入口。 */
  projectName?: string | null
  onReset: () => void
}
```

3b. `AimWorkbenchHeader` 解构加 `onStageChange`，`StageItem` 调用处（:62-69）透传：

```tsx
              {AIM_WORKFLOW_STAGES.map((stage, index) => (
                <StageItem
                  key={stage.id}
                  stage={stage}
                  index={index}
                  currentIndex={currentIndex}
                  onStageChange={onStageChange}
                />
              ))}
```

3c. `StageItem`（:100-167）：外层 `span` 按可点击性换成 `button`：

```tsx
function StageItem(props: {
  stage: (typeof AIM_WORKFLOW_STAGES)[number]
  index: number
  currentIndex: number
  onStageChange?: (stage: AimWorkflowStage) => void
}) {
  const { stage, index, currentIndex, onStageChange } = props
  const isCurrent = stage.id === (AIM_WORKFLOW_STAGES[currentIndex]?.id ?? null)
  const isDone = index < currentIndex
  const isNext = index === currentIndex + 1
  const clickable = !isCurrent && Boolean(onStageChange)
  const Tag = clickable ? "button" : "span"
  return (
    <li className="flex items-center">
      <Tag
        {...(clickable ? {
          type: "button" as const,
          "aria-label": `切换到${stage.title}`,
          onClick: () => onStageChange?.(stage.id),
        } : {})}
        title={stage.description}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "relative inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium leading-none transition-all duration-200",
          clickable && "cursor-pointer hover:bg-primary/8 hover:text-primary",
          isCurrent &&
            "bg-gradient-to-r from-primary/15 via-primary/10 to-amber-500/10 text-primary shadow-[0_0_0_1px_rgba(209,74,51,0.18),0_2px_8px_-4px_rgba(209,74,51,0.25)]",
          isDone && "text-muted-foreground/85",
          !isCurrent && !isDone && "text-muted-foreground/60",
        )}
      >
        {/* 序号圆点与标题内部结构保持原样（:122-151 原代码不动） */}
      </Tag>
      {/* 连接线保持原样（:152-164 原代码不动） */}
    </li>
  )
}
```

注意：函数行数会逼近 80 行上限；若超限，把「序号圆点」抽成 `StageBadge({ index, isCurrent, isDone })` 子组件。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-workbench-header.test.tsx && pnpm typecheck && pnpm longfn:check`
Expected: PASS；typecheck 无错；无新增超长函数。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/components/aim/aim-workbench-header.tsx apps/web/__tests__/components/aim-workbench-header.test.tsx
git commit -m "feat(aim): 工作台四阶段条支持点击切换阶段"
```

---

### Task 3: composer 显性「先确认再生成」开关

**Files:**
- Modify: `apps/web/src/components/aim/aim-action-bar.tsx`（AimActionBar props + ActionBarLeft 渲染）
- Modify: `apps/web/src/components/aim/aim-prompt-composer-shell.tsx`（ComposerPanelsAndBar props 透传）
- Modify: `apps/web/src/components/aim/aim-prompt-composer.tsx`（view props + 派生状态）
- Test: `apps/web/__tests__/components/aim-prompt-composer-plan-toggle.test.tsx`（新建）

**Interfaces:**
- Consumes: page 已传 `composerMode` / `onComposerModeChange` / `canUsePlanMode`（page.tsx:263-264）；composer 内部已有 `showPlanModeControl = !isPlanSessionActive && Boolean(onComposerModeChange)`（aim-prompt-composer.tsx:371）。`AimComposerMode` 取值 `"direct" | "plan"`（`src/components/aim/aim-prompt-shared.ts`）。
- Produces: `AimActionBar` 新增可选 props `showPlanModeToggle?: boolean`、`planModeActive?: boolean`、`onTogglePlanMode?: () => void`；开关文案「先确认再生成 / 先确认 · 已启用」。

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/__tests__/components/aim-prompt-composer-plan-toggle.test.tsx`：

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimPromptComposer } from "@/components/aim/aim-prompt-composer"
import { getAimAgentCapabilities } from "@/lib/aim/agent-capabilities"

function baseProps(overrides: Partial<React.ComponentProps<typeof AimPromptComposer>> = {}) {
  return {
    value: "",
    placeholder: "说说你的需求",
    busy: false,
    isRecording: false,
    isTranscribing: false,
    isGenerating: false,
    canGenerate: true,
    primaryActionLabel: "生成",
    onChange: vi.fn(),
    onGenerate: vi.fn(),
    onStartRecording: vi.fn(),
    onStopRecording: vi.fn(),
    composerMode: "direct" as const,
    canUsePlanMode: true,
    onComposerModeChange: vi.fn(),
    capabilities: getAimAgentCapabilities("content_producer"),
    ...overrides,
  }
}

describe("composer 计划模式开关", () => {
  it("direct 模式下点击「先确认再生成」切换到 plan", async () => {
    const user = userEvent.setup()
    const onComposerModeChange = vi.fn()
    render(<AimPromptComposer {...baseProps({ onComposerModeChange })} />)

    await user.click(screen.getByRole("button", { name: /先确认再生成/ }))
    expect(onComposerModeChange).toHaveBeenCalledWith("plan")
  })

  it("plan 模式下开关显示已启用，点击切回 direct", async () => {
    const user = userEvent.setup()
    const onComposerModeChange = vi.fn()
    render(<AimPromptComposer {...baseProps({ composerMode: "plan", onComposerModeChange })} />)

    await user.click(screen.getByRole("button", { name: /先确认 · 已启用/ }))
    expect(onComposerModeChange).toHaveBeenCalledWith("direct")
  })

  it("canUsePlanMode 为 false 时不渲染开关", () => {
    render(<AimPromptComposer {...baseProps({ canUsePlanMode: false })} />)

    expect(screen.queryByRole("button", { name: /先确认/ })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-prompt-composer-plan-toggle.test.tsx`
Expected: FAIL —— 找不到「先确认再生成」按钮。

- [ ] **Step 3: 实现**

3a. `aim-action-bar.tsx`：`AimActionBar` props 加三个可选字段，并透传给 `ActionBarLeft`：

```ts
  /** 显性计划模式开关（先确认再生成）；showPlanModeControl && canUsePlanMode 时为 true */
  showPlanModeToggle?: boolean
  planModeActive?: boolean
  onTogglePlanMode?: () => void
```

`ActionBarLeft` 在「我的风格」块（:151-183）之后、`StatusPill`（:184-188）之前渲染（`ListChecks` 已在 :4 的 lucide 导入里）：

```tsx
      {showPlanModeToggle ? (
        <button
          type="button"
          onClick={onTogglePlanMode}
          aria-pressed={Boolean(planModeActive)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-all",
            planModeActive
              ? "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400"
              : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/20 hover:text-foreground",
          )}
          title={planModeActive ? "点击关闭：直接生成，不再先出任务单" : "点击开启：先出任务单，你确认后再生成"}
        >
          <ListChecks className="h-3.5 w-3.5" strokeWidth={2} />
          {planModeActive ? "先确认 · 已启用" : "先确认再生成"}
        </button>
      ) : null}
```

3b. `aim-prompt-composer-shell.tsx`：`ComposerPanelsAndBarProps` 加同样三个可选字段，`ComposerPanelsAndBar` 解构后透传给 `<AimActionBar … showPlanModeToggle={showPlanModeToggle} planModeActive={planModeActive} onTogglePlanMode={onTogglePlanMode} />`。

3c. `aim-prompt-composer.tsx`：`AimPromptComposerViewProps` 加同样三个可选字段；在派生状态处（:371 附近）计算并传入 view：

```ts
  const planModeActive = composerMode === "plan"
  const showPlanModeToggle = showPlanModeControl && canUsePlanMode
  const onTogglePlanMode = onComposerModeChange
    ? () => onComposerModeChange(planModeActive ? "direct" : "plan")
    : undefined
```

`ComposerPanelsAndBar` 调用处（:234-282）加三行透传。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-prompt-composer-plan-toggle.test.tsx && pnpm test:component __tests__/components/aim-prompt-composer.test.tsx && pnpm typecheck`
Expected: 新旧测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/components/aim/aim-action-bar.tsx apps/web/src/components/aim/aim-prompt-composer-shell.tsx apps/web/src/components/aim/aim-prompt-composer.tsx apps/web/__tests__/components/aim-prompt-composer-plan-toggle.test.tsx
git commit -m "feat(aim): composer 底栏新增「先确认再生成」显性开关"
```

---

### Task 4: 空状态快捷指令 chips

**Files:**
- Modify: `apps/web/src/components/aim/aim-message-stream.tsx:180-190, 192-201, 219-221`
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx:360-368`（传 quickPrompts）
- Test: `apps/web/__tests__/components/aim-empty-message-state.test.tsx`（新建）

**Interfaces:**
- Consumes: `getAimAgentGuide(agentId).quickPrompts: string[]`（`src/lib/aim-agent-guides.ts`，AimAgentGuide 已含此字段）；`actions.onSubmitChoice` 已存在并走 `w.sendText`（page.tsx:370）。
- Produces: `AimMessageStreamProps` 新增可选 `quickPrompts?: string[]`；空状态最多渲染 3 个 chip，点击等价于发送该指令。

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/__tests__/components/aim-empty-message-state.test.tsx`：

```tsx
import { createElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimMessageStream } from "@/components/aim/aim-message-stream"

vi.mock("@/components/aim/aim-deliverable-bubble", () => ({
  AimDeliverableBubble: () => null,
}))
vi.mock("@/components/aim/aim-run-outcome-select-items", () => ({
  AimRunOutcomeActions: () => null,
}))
vi.mock("@/components/aim/aim-message-jump-rail", () => ({
  AimMessageJumpRail: () => null,
}))

function baseActions() {
  return {
    onSubmitChoice: vi.fn(),
    onRetry: vi.fn(),
    onApplyReplacement: vi.fn(),
    onRepurpose: vi.fn(() => vi.fn()),
    onQuality: vi.fn(() => vi.fn()),
    onMarkStatus: vi.fn(() => vi.fn()),
    onFinalDisposition: vi.fn(() => vi.fn()),
    onNextAction: vi.fn(),
    onOpenRecord: vi.fn(),
    onCompileToWiki: vi.fn(),
    onInlineContentSaved: vi.fn(),
    onInlineSelectionRewrite: vi.fn(),
  }
}

describe("空状态快捷指令", () => {
  it("渲染快捷 chip，点击后触发 onSubmitChoice", async () => {
    const user = userEvent.setup()
    const actions = baseActions()
    render(
      <AimMessageStream
        messages={[]}
        busy={false}
        agentIntro="这里是内容文案创作。"
        workflowStage="content"
        selectedAgentId="content_producer"
        selectedProjectId=""
        quickPrompts={["粘贴对标文案，帮我拆解重写", "口述一个选题"]}
        actions={actions}
      />,
    )

    await user.click(screen.getByRole("button", { name: "粘贴对标文案，帮我拆解重写" }))
    expect(actions.onSubmitChoice).toHaveBeenCalledWith("粘贴对标文案，帮我拆解重写")
  })

  it("最多展示 3 个 chip", () => {
    render(
      <AimMessageStream
        messages={[]}
        busy={false}
        agentIntro="简介"
        workflowStage="content"
        selectedAgentId="content_producer"
        selectedProjectId=""
        quickPrompts={["甲", "乙", "丙", "丁"]}
        actions={baseActions()}
      />,
    )

    expect(screen.getByRole("button", { name: "丙" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "丁" })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-empty-message-state.test.tsx`
Expected: FAIL —— `quickPrompts` prop 不存在，chip 不渲染（TS 报错或找不到按钮）。

- [ ] **Step 3: 实现**

3a. `aim-message-stream.tsx` 的 `EmptyMessageState`（:180-190）：

```tsx
function EmptyMessageState({ agentIntro, quickPrompts, onQuickPrompt }: {
  agentIntro: string
  quickPrompts?: string[]
  onQuickPrompt?: (text: string) => void
}) {
  const prompts = quickPrompts?.slice(0, 3) ?? []
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col py-6">
      <div className="max-w-2xl text-left">
        <p className="line-clamp-3 text-base leading-7 text-muted-foreground">{agentIntro}</p>
        {prompts.length && onQuickPrompt ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto whitespace-normal rounded-full px-3.5 py-2 text-left text-sm"
                onClick={() => onQuickPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

3b. `AimMessageStreamProps`（:192-201）加 `quickPrompts?: string[]`；渲染处（:219-221）：

```tsx
        {props.messages.length === 0 ? (
          <EmptyMessageState
            agentIntro={props.agentIntro}
            quickPrompts={props.quickPrompts}
            onQuickPrompt={props.actions.onSubmitChoice}
          />
        ) : (
```

3c. `page.tsx`：文件顶部 import 区加 `import { getAimAgentGuide } from "@/lib/aim-agent-guides"`（若无）；`AimMessageStream` 调用处（:360-368）加一行：

```tsx
              quickPrompts={getAimAgentGuide(w.selectedAgentId).quickPrompts}
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-empty-message-state.test.tsx && pnpm test __tests__/unit/aim-message-stream.test.ts && pnpm typecheck`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/components/aim/aim-message-stream.tsx "apps/web/src/app/(dashboard)/aim/page.tsx" apps/web/__tests__/components/aim-empty-message-state.test.tsx
git commit -m "feat(aim): 对话空状态展示专家快捷指令，点击即发送"
```

---

### Task 5: 顶部信息条合并为可折叠上下文条

**Files:**
- Create: `apps/web/src/components/aim/aim-context-bar.tsx`
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx:300-310`
- Test: `apps/web/__tests__/components/aim-context-bar.test.tsx`（新建）

**Interfaces:**
- Consumes: page 现有 `AimKnowledgeAssetsRow`、`ProjectWeeklyContent`、`ProjectWeeklyBusinessReview` 三个信息条（page.tsx:306-310）。
- Produces: `AimContextBar({ summary: string; defaultExpanded?: boolean; children })`——默认折叠为一行摘要，点击展开。`AimProjectNotices`（阻断性错误提示）与 `AimEvolutionSuggestions`（带操作的建议条）保持独立，不收进此组件。

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/__tests__/components/aim-context-bar.test.tsx`：

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimContextBar } from "@/components/aim/aim-context-bar"

describe("AimContextBar", () => {
  it("默认折叠：显示摘要，不渲染内容", () => {
    render(
      <AimContextBar summary="IP 档案 · 本周进展">
        <div>档案详情</div>
      </AimContextBar>,
    )

    expect(screen.getByText("IP 档案 · 本周进展")).toBeTruthy()
    expect(screen.queryByText("档案详情")).toBeNull()
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false")
  })

  it("点击展开内容，再点击收起", async () => {
    const user = userEvent.setup()
    render(
      <AimContextBar summary="IP 档案 · 本周进展">
        <div>档案详情</div>
      </AimContextBar>,
    )

    await user.click(screen.getByRole("button"))
    expect(screen.getByText("档案详情")).toBeTruthy()
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true")

    await user.click(screen.getByRole("button"))
    expect(screen.queryByText("档案详情")).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-context-bar.test.tsx`
Expected: FAIL —— 模块 `@/components/aim/aim-context-bar` 不存在。

- [ ] **Step 3: 实现**

3a. 新建 `apps/web/src/components/aim/aim-context-bar.tsx`：

```tsx
"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/** 工作台顶部上下文条：把 IP 档案、本周进展等信息条折叠成一行摘要，点击展开。 */
export function AimContextBar(props: {
  summary: string
  defaultExpanded?: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(Boolean(props.defaultExpanded))
  return (
    <div className="shrink-0 border-b border-border/50">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:px-5"
      >
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{props.summary}</span>
      </button>
      {expanded ? <div className="px-3 pb-2 sm:px-5">{props.children}</div> : null}
    </div>
  )
}
```

3b. `page.tsx`：import 区加 `import { AimContextBar } from "@/components/aim/aim-context-bar"`；把 :306-310 的三行替换为：

```tsx
        {w.projectEnabled && w.selectedProjectId && !isLanding ? (
          <AimContextBar
            summary={[
              "IP 档案",
              "本周进展",
              w.currentWorkflowStage === "results" ? "经营复盘" : null,
            ].filter(Boolean).join(" · ")}
          >
            <AimKnowledgeAssetsRow projectId={w.selectedProjectId} onOpenIpProfile={() => setIpProfileOpen(true)} sourceOriginalText={w.sourceOriginalText} sourceAnalysisText={w.sourceAnalysisText} sourceTopicTitle={w.sourceTopicTitle} />
            <ProjectWeeklyContent projectId={w.selectedProjectId} />
            {w.currentWorkflowStage === "results" ? <ProjectWeeklyBusinessReview projectId={w.selectedProjectId} /> : null}
          </AimContextBar>
        ) : null}
```

`AimProjectNotices`（:300-305）与 `AimEvolutionSuggestions`（:312-316）保持原位不动。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test:component __tests__/components/aim-context-bar.test.tsx && pnpm typecheck`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/components/aim/aim-context-bar.tsx "apps/web/src/app/(dashboard)/aim/page.tsx" apps/web/__tests__/components/aim-context-bar.test.tsx
git commit -m "feat(aim): 工作台顶部信息条折叠为上下文摘要条"
```

---

### Task 6: 交付物「导出 Markdown」

**Files:**
- Create: `apps/web/src/lib/aim/download-markdown.ts`
- Modify: `apps/web/src/components/aim/aim-inline-document-card.tsx`（toolbar 加导出按钮）
- Test: `apps/web/__tests__/unit/download-markdown.test.ts`（新建）、`apps/web/__tests__/components/aim-inline-document-card-export.test.tsx`（新建）

**Interfaces:**
- Consumes: `AimInlineDocumentCard` 现有 toolbar 与 `AIM_SOFT_ACTION_CLASS`（`src/lib/aim/workbench-display.ts`）；卡片 props 已有 `topicTitle?: string`、`content`、`messageId`。
- Produces: `buildMarkdownFilename(title?: string): string`（纯函数）；`downloadMarkdown(filename, content): void`（DOM 副作用）。

- [ ] **Step 1: 写失败的测试**

1a. 新建 `apps/web/__tests__/unit/download-markdown.test.ts`（node 环境，只测纯函数）：

```ts
import { describe, expect, it } from "vitest"

import { buildMarkdownFilename } from "@/lib/aim/download-markdown"

describe("buildMarkdownFilename", () => {
  it("用标题生成安全的 .md 文件名", () => {
    expect(buildMarkdownFilename("中汝达 口播/初稿")).toMatch(/^中汝达-口播-初稿-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it("无标题时回退默认名", () => {
    expect(buildMarkdownFilename()).toMatch(/^aim-content-\d{4}-\d{2}-\d{2}\.md$/)
    expect(buildMarkdownFilename("   ")).toMatch(/^aim-content-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it("超长标题截断到 40 字", () => {
    const name = buildMarkdownFilename("长".repeat(80))
    expect(name.length).toBeLessThanOrEqual(40 + 11 + 3)
  })
})
```

1b. 新建 `apps/web/__tests__/components/aim-inline-document-card-export.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AimInlineDocumentCard } from "@/components/aim/aim-inline-document-card"

const clickSpy = vi.fn()

beforeEach(() => {
  clickSpy.mockClear()
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy)
})

function baseProps(overrides: Partial<React.ComponentProps<typeof AimInlineDocumentCard>> = {}) {
  return {
    messageId: "m1",
    generationId: "g1",
    format: "raw_copy" as const,
    content: "这是正文内容",
    renderView: (text: string) => text,
    isSessionOwner: true,
    canStartEdit: true,
    onRequestEditOwnership: () => true,
    onReleaseEditOwnership: vi.fn(),
    onContentSaved: vi.fn(),
    onSelectionRewrite: vi.fn(),
    topicTitle: "中汝达口播",
    ...overrides,
  }
}

describe("交付物导出 Markdown", () => {
  it("点击「导出」触发 .md 下载，文件名含主题", async () => {
    const user = userEvent.setup()
    render(<AimInlineDocumentCard {...baseProps()} />)

    await user.click(screen.getByRole("button", { name: /导出/ }))
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && pnpm test __tests__/unit/download-markdown.test.ts && pnpm test:component __tests__/components/aim-inline-document-card-export.test.tsx`
Expected: FAIL —— 模块不存在 / 找不到「导出」按钮。

- [ ] **Step 3: 实现**

3a. 新建 `apps/web/src/lib/aim/download-markdown.ts`：

```ts
/** 交付物导出：把文案内容打包成 .md 文件并触发浏览器下载。 */

export function buildMarkdownFilename(title?: string): string {
  const base = (title ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  const date = new Date().toISOString().slice(0, 10)
  return `${base || "aim-content"}-${date}.md`
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
```

3b. `aim-inline-document-card.tsx`：lucide 导入（:5）加 `Download`；文件顶部加：

```ts
import { buildMarkdownFilename, downloadMarkdown } from "@/lib/aim/download-markdown"
```

组件内 `copyText` 函数后加：

```ts
  function exportMarkdown() {
    downloadMarkdown(buildMarkdownFilename(props.topicTitle), editing ? draft : props.content)
    toast.success("已导出 Markdown")
  }
```

toolbar 的「复制」按钮（:200-202）后加：

```tsx
        <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={exportMarkdown}>
          <Download className="h-3.5 w-3.5" />导出
        </Button>
```

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd apps/web && pnpm test __tests__/unit/download-markdown.test.ts && pnpm test:component __tests__/components/aim-inline-document-card-export.test.tsx && pnpm typecheck`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
cd mingyuan && git add apps/web/src/lib/aim/download-markdown.ts apps/web/src/components/aim/aim-inline-document-card.tsx apps/web/__tests__/unit/download-markdown.test.ts apps/web/__tests__/components/aim-inline-document-card-export.test.tsx
git commit -m "feat(aim): 交付物支持一键导出 Markdown 文件"
```

---

## 明确不做（本计划范围外）

- **@引用知识库条目**：需要前后端检索与注入链路，单独立项。
- **composer 内项目切换 chip**：顶部 header 已有只读项目 chip（aim-workbench-header.tsx:80-84）；账号绑定项目的产品决策未定，不动。
- **思考步骤文案「人话化」**：服务端步骤已带 `label`/`summary`（如「意图约束解析」）；Task 1 先打通链路，文案打磨视真实效果再迭代。
- **ThinkingProcessPanel 完成后 3 秒自动折叠**：保留现状（折叠后摘要条仍可展开）；如用户反馈要看全过程，再调。
- **/home 首页优化**（首屏主角、五官链路等）：属上一论评审结论，不在本计划。
