# AIM 认知编排器 + 高客单升级 (Sprint 1+2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AIM 加上协作认知层（TaskSpec：风险/模式/事实/缺口/假设），并打通选题→成片→结构化业务结果的链路，消除选题伪精确评分——只做 Sprint 1 + Sprint 2。

**Architecture:** 复用现有 AIM 生成流、交付契约、选题引擎、鉴权。新增一个 `lib/task-spec.ts` 纯函数模块（规则骨架 + 可选 LLM 精化 + 降级），在 `AimGeneration` 加 `taskSpec/taskSelectionId/selectedTopicIndex`，新建 `ContentOutcome` 表。所有事实字段只由确定性代码从真实上下文抽取，LLM 只产出判断类字段。

**Tech Stack:** Next.js 16 (App Router) + Prisma 7 (mysql) + TypeScript + Vitest + Zod。鉴权 `withUserAuth`/`authenticateRequest`，LLM 走 `getAgentLLM`（零 Mock）。

**Spec:** `docs/superpowers/specs/2026-07-11-aim-cognition-vertical-upgrade-design.md` (commit `bd3bdd0`)

**Repo root for all paths:** `/Users/xiangyu/Desktop/明动aim智能体/mingyuan`
**Web app root:** `apps/web`（下文相对路径以 `apps/web` 为根）
**Run commands from:** `apps/web`

---

## 文件结构总览

| 文件 | 责任 | 动作 |
|---|---|---|
| `prisma/schema.prisma` | 数据模型 | 改：AimGeneration 加 3 字段；新建 ContentOutcome |
| `prisma/migrations/20260711100000_*/migration.sql` | 迁移 | 新建 |
| `src/lib/task-spec.ts` | TaskSpec 类型 + 规则分类 + LLM 精化 + 降级 | 新建 |
| `src/lib/topic-validation.ts` | 选题 verdict 枚举 | 改 |
| `src/lib/topic-generation.ts` | 消除伪精确分 | 改 |
| `src/lib/topic-daily-report.ts` | scoreOf 缺分处理 | 改 |
| `src/lib/aim-delivery-contract.ts` | 交付契约按 mode 折叠/展开 | 改 |
| `src/lib/aim-generate-validate.ts` | 解析 topicSelectionId/selectedTopicIndex | 改 |
| `src/lib/aim-generator.ts` | AimInput 增字段 + 调 task-spec | 改 |
| `src/lib/aim-agent-handlers.ts` | 落库 taskSpec/topicSelectionId/selectedTopicIndex | 改 |
| `src/lib/api/client.ts` | AimGenerateRequest 增字段 + ContentOutcome 客户端 | 改 |
| `src/app/api/aim/history/[id]/outcome/route.ts` | ContentOutcome GET/PUT | 新建 |
| `src/app/api/aim/runs/[runId]/events/route.ts` | 扩展事件枚举 + reason | 改 |
| `src/app/(dashboard)/aim/page.tsx` | 交付条扩展 + 复盘录入 + 跳转参数 | 改 |
| `src/app/(dashboard)/topic-planning/page.tsx` | jumpToAim 带 id/index | 改 |
| `__tests__/unit/task-spec.test.ts` | TaskSpec 单测 | 新建 |
| `__tests__/unit/content-outcome.test.ts` | ContentOutcome 单测 | 新建 |
| `__tests__/unit/topic-verdict.test.ts` | 选题 verdict 单测 | 新建 |

---

## Task 1: 数据模型 — Prisma schema 扩展

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (AimGeneration 模型 ~line 426-468; 文件末尾追加 ContentOutcome)

- [ ] **Step 1: 给 AimGeneration 加 3 个字段**

在 `apps/web/prisma/schema.prisma` 的 `AimGeneration` 模型里，找到 `topicTitle` 行（约 line 443-444 区域），在 `hotTopic` 之后、`polishInstruction` 之前插入：

```prisma
  topicTitle       String?  @db.Text
  topicSelectionId String?  @db.VarChar(30) // 来源选题批次 TopicSelection.id
  selectedTopicIndex Int?   // 采用的第几号候选 (0-3)
  hotTopic         String?  @db.Text
```

并在 `calibrationRules` 行之后、`wechatDraft` 之前加：

```prisma
  calibrationRules Json     @default("[]")
  taskSpec         Json?    // 协作认知 + 业务判断统一结构（见 lib/task-spec.ts）
  wechatDraft      Json?
```

- [ ] **Step 2: 在 schema 末尾追加 ContentOutcome 模型**

在 `apps/web/prisma/schema.prisma` 文件最末尾（最后一个 model 之后）追加：

```prisma

// ─── 内容发布结果（结构化，Sprint 2） ───────────────────
// 同一 AimGeneration 可按采集窗口(7/14/30天)记录多条；所有指标 nullable，未填写不得为 0。
model ContentOutcome {
  id                  String   @id @default(cuid())
  userId              String
  generationId        String
  topicSelectionId    String?  @db.VarChar(30)
  projectId           String?
  platform            String?  @db.VarChar(40)
  publishedAt         DateTime?
  collectedAt         DateTime @default(now())
  collectWindowDay    Int      // 7 | 14 | 30

  // 第一组：商业结果（nullable）
  qualifiedCommentCount Int?
  dmCount               Int?
  qualifiedLeadCount    Int?
  appointmentCount      Int?
  dealCount             Int?
  revenue               Decimal? @db.Decimal(14, 2)

  // 第二组：内容信号（nullable）
  views       Int?
  likes       Int?
  comments    Int?
  saves       Int?
  shares      Int?

  // 第三组：用户反馈（自由文本）
  audienceFeedback String? @db.Text
  userVerdict      String? @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user       User          @relation(fields: [userId], references: [id])
  generation AimGeneration @relation(fields: [generationId], references: [id], onDelete: Cascade)

  @@unique([userId, generationId, collectWindowDay])
  @@index([userId, collectedAt])
  @@index([generationId])
}
```

- [ ] **Step 3: 给 AimGeneration 加反向关系**

在 `AimGeneration` 模型的 relations 区域（`project ClientProject? @relation(...)` 那行之后）加：

```prisma
  user    User           @relation(fields: [userId], references: [id])
  project ClientProject? @relation(fields: [projectId], references: [id])
  contentOutcomes ContentOutcome[]
```

- [ ] **Step 4: 生成迁移**

Run (from `apps/web`):
```bash
DATABASE_URL='mysql://clipflow:clipflow@127.0.0.1:3306/clipflow' npx prisma migrate dev --name add_task_spec_and_content_outcome --schema prisma/schema.prisma
```
Expected: 生成 `prisma/migrations/20260711100000_add_task_spec_and_content_outcome/migration.sql`，包含 `ALTER TABLE AimGeneration ADD ...` 与 `CREATE TABLE ContentOutcome ...`。若提示密码错误，按 `.env.local` 中真实凭据替换 `clipflow:clipflow`。

- [ ] **Step 5: 验证 Prisma client 可生成 + typecheck**

Run (from `apps/web`):
```bash
npx prisma generate --schema prisma/schema.prisma && pnpm typecheck 2>&1 | tail -20
```
Expected: generate 成功；typecheck 不应因本改动新增错误（可能存在与本次无关的既有错误，记录但不阻断）。

- [ ] **Step 6: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/20260711100000_add_task_spec_and_content_outcome/
git commit -m "feat(aim): add AimGeneration.taskSpec/topicSelectionId + ContentOutcome model"
```

---

## Task 2: TaskSpec 核心模块（TDD，纯函数）

**Files:**
- Create: `apps/web/src/lib/task-spec.ts`
- Test: `apps/web/__tests__/unit/task-spec.test.ts`

- [ ] **Step 1: 写失败测试 `__tests__/unit/task-spec.test.ts`**

```typescript
import { describe, it, expect } from "vitest"
import {
  buildTaskSpecSkeleton,
  RISK_KEYWORDS_HIGH,
  inferRiskLevel,
  inferMode,
  sanitizeLLMRefinement,
  type TaskSpecInput,
} from "@/lib/task-spec"

const baseInput: TaskSpecInput = {
  agentId: "content_producer",
  taskType: "write_script",
  rawInput: "围绕企业咨询的客户分层讲一条",
  project: {
    name: "测试项目",
    targetCustomer: "中小企业老板",
    industry: "企业咨询",
    offer: "管理咨询服务",
    deliveryGoal: "先诊断后成交",
  },
  topicSelection: null,
  knowledgeTitles: [],
}

describe("inferRiskLevel", () => {
  it("polish_copy/repurpose/free_copywriter 为低风险", () => {
    expect(inferRiskLevel({ ...baseInput, taskType: "polish_copy", agentId: "content_producer" })).toBe("low")
    expect(inferRiskLevel({ ...baseInput, taskType: "repurpose", agentId: "free_copywriter" })).toBe("low")
  })
  it("business_diagnosis/persona 为高风险", () => {
    expect(inferRiskLevel({ ...baseInput, agentId: "business_diagnosis" })).toBe("high")
    expect(inferRiskLevel({ ...baseInput, agentId: "persona" })).toBe("high")
  })
  it("含高风险关键词(商业诊断/IP定位/成交路径)为高风险", () => {
    expect(inferRiskLevel({ ...baseInput, agentId: "content_producer", rawInput: "帮我做商业诊断" })).toBe("high")
  })
  it("write_script 默认中风险", () => {
    expect(inferRiskLevel({ ...baseInput })).toBe("medium")
  })
})

describe("inferMode", () => {
  it("低风险 -> direct_delivery", () => {
    expect(inferMode("low", false)).toBe("direct_delivery")
  })
  it("中风险 -> assumption_delivery", () => {
    expect(inferMode("medium", false)).toBe("assumption_delivery")
  })
  it("高风险 + 资料完整 -> assumption_delivery", () => {
    expect(inferMode("high", true)).toBe("assumption_delivery")
  })
  it("高风险 + 资料缺失 -> discovery_exploration", () => {
    expect(inferMode("high", false)).toBe("discovery_exploration")
  })
  it("永不主动返回 feedback_iteration（属 Sprint3）", () => {
    for (const risk of ["low", "medium", "high"] as const) {
      for (const complete of [true, false]) {
        expect(inferMode(risk, complete)).not.toBe("feedback_iteration")
      }
    }
  })
})

describe("buildTaskSpecSkeleton", () => {
  it("knownFacts 只来自真实上下文，不臆造", () => {
    const spec = buildTaskSpecSkeleton(baseInput)
    const allKnown = spec.knownFacts.map((f) => f.statement).join("|")
    expect(allKnown).toContain("中小企业老板")
    expect(spec.knownFacts.every((f) => f.source)).toBe(true)
    // 不应出现凭空编造的数字/案例
    expect(allKnown).not.toMatch(/\d+%/)
  })
  it("项目资料缺失时 targetCustomer 为 undefined（非空字符串）", () => {
    const spec = buildTaskSpecSkeleton({ ...baseInput, project: null })
    expect(spec.targetCustomer).toBeUndefined()
  })
  it("高风险+资料缺失 -> discovery_exploration + unknowns 非空", () => {
    const spec = buildTaskSpecSkeleton({
      ...baseInput,
      agentId: "business_diagnosis",
      project: null,
    })
    expect(spec.mode).toBe("discovery_exploration")
    expect(spec.unknowns.length).toBeGreaterThan(0)
  })
  it("classifiedBy 标记为 rule", () => {
    expect(buildTaskSpecSkeleton(baseInput).classifiedBy).toBe("rule")
  })
})

describe("sanitizeLLMRefinement", () => {
  it("丢弃 LLM 试图塞入的 knownFacts（铁律）", () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const cleaned = sanitizeLLMRefinement(skeleton, {
      mode: "assumption_delivery",
      unknowns: ["客户当前客单价区间"],
      assumptions: [{ statement: "客户主推 30-100 万项目", impact: "medium" }],
      knownFacts: [{ statement: "编造：客户年营收 5000 万" }],
    })
    expect(cleaned.knownFacts.find((f) => f.statement.includes("5000 万"))).toBeUndefined()
    expect(cleaned.classifiedBy).toBe("llm")
    expect(cleaned.unknowns).toContain("客户当前客单价区间")
  })
  it("LLM mode 超出规则候选范围则忽略，保持骨架 mode", () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const cleaned = sanitizeLLMRefinement(skeleton, { mode: "feedback_iteration" })
    expect(cleaned.mode).toBe(skeleton.mode)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run (from `apps/web`):
```bash
pnpm vitest run __tests__/unit/task-spec.test.ts 2>&1 | tail -15
```
Expected: FAIL（模块不存在 / 导出未定义）。

- [ ] **Step 3: 实现 `src/lib/task-spec.ts`**

```typescript
import type { AimTaskType } from "@/lib/aim-generator"

export type CollaborationMode =
  | "direct_delivery"
  | "assumption_delivery"
  | "feedback_iteration"
  | "discovery_exploration"

export type RiskLevel = "low" | "medium" | "high"

export type ContentTask =
  | "吸引目标客户"
  | "建立专业信任"
  | "展示真实案例"
  | "筛选不适合客户"
  | "解释问题与方法"
  | "推动咨询行动"

export type TrustAsset = "案例" | "资历" | "过程" | "观点" | "客户反馈" | "交付方法"

export type DesiredAction = "评论" | "私信" | "领取资料" | "预约诊断" | "进一步咨询"

export interface TaskSpecInput {
  agentId?: string
  taskType?: AimTaskType
  rawInput: string
  project: {
    name?: string | null
    targetCustomer?: string | null
    industry?: string | null
    offer?: string | null
    deliveryGoal?: string | null
  } | null
  topicSelection: {
    title?: string
    rationale?: string
    targetCustomer?: string
    sourceHighlights?: Array<{ category?: string; title?: string; content?: string }>
  } | null
  knowledgeTitles: string[]
}

export interface TaskSpec {
  goal: string
  mode: CollaborationMode
  riskLevel: RiskLevel
  targetCustomer?: string
  realProblem?: string
  contentTask?: ContentTask
  trustAssetType?: TrustAsset
  exclusiveEvidence?: string
  desiredAction?: DesiredAction
  dealPath?: string
  knownFacts: Array<{ statement: string; source: string }>
  unknowns: string[]
  assumptions: Array<{ statement: string; impact: "low" | "medium" | "high" }>
  rationale?: string
  nextAction: string
  classifiedBy: "rule" | "llm" | "rule_fallback"
  classifiedAt: string
}

// 风险关键词（高）
export const RISK_KEYWORDS_HIGH = [
  "商业诊断", "IP定位", "ip定位", "成交路径", "人群判断", "产品设计", "市场机会", "定位策划",
]

const LOW_TASK_TYPES: AimTaskType[] = ["polish_copy", "repurpose"]
const HIGH_AGENTS = new Set(["business_diagnosis", "business_system_diagnosis", "persona"])
const LOW_AGENTS = new Set(["free_copywriter"])

export function inferRiskLevel(input: TaskSpecInput): RiskLevel {
  const { agentId, taskType, rawInput } = input
  if (taskType && LOW_TASK_TYPES.includes(taskType)) return "low"
  if (agentId && LOW_AGENTS.has(agentId)) return "low"
  if (agentId && HIGH_AGENTS.has(agentId)) return "high"
  if (RISK_KEYWORDS_HIGH.some((kw) => rawInput.includes(kw))) return "high"
  return "medium"
}

/** 关键资料是否完整：至少要有目标客户 + offer/deliveryGoal 之一 */
function isProjectComplete(project: TaskSpecInput["project"]): boolean {
  if (!project) return false
  const hasCustomer = !!(project.targetCustomer && project.targetCustomer.trim())
  const hasOffer = !!(project.offer && project.offer.trim()) || !!(project.deliveryGoal && project.deliveryGoal.trim())
  return hasCustomer && hasOffer
}

export function inferMode(risk: RiskLevel, projectComplete: boolean): CollaborationMode {
  if (risk === "low") return "direct_delivery"
  if (risk === "medium") return "assumption_delivery"
  // high
  return projectComplete ? "assumption_delivery" : "discovery_exploration"
}

function deriveGoal(input: TaskSpecInput): string {
  const title = input.topicSelection?.title?.trim()
  if (title) return title.slice(0, 80)
  return input.rawInput.trim().slice(0, 80) || "未明确目标"
}

export function buildTaskSpecSkeleton(input: TaskSpecInput): TaskSpec {
  const risk = inferRiskLevel(input)
  const projectComplete = isProjectComplete(input.project)
  const mode = inferMode(risk, projectComplete)

  const knownFacts: TaskSpec["knownFacts"] = []
  const p = input.project
  if (p?.targetCustomer?.trim()) knownFacts.push({ statement: p.targetCustomer.trim(), source: "项目-目标客户" })
  if (p?.industry?.trim()) knownFacts.push({ statement: `${p.industry.trim()} 行业`, source: "项目-行业" })
  if (p?.offer?.trim()) knownFacts.push({ statement: p.offer.trim(), source: "项目-主推产品/服务" })
  if (p?.deliveryGoal?.trim()) knownFacts.push({ statement: p.deliveryGoal.trim(), source: "项目-成交目标" })
  const sh = input.topicSelection?.sourceHighlights ?? []
  for (const h of sh.slice(0, 4)) {
    if (h?.content?.trim()) knownFacts.push({ statement: h.content.trim().slice(0, 120), source: `选题证据-${h.title || h.category || "来源"}` })
  }

  const unknowns: string[] = []
  if (risk === "high") {
    if (!p?.targetCustomer?.trim()) unknowns.push("目标客户画像不明确")
    if (!p?.offer?.trim()) unknowns.push("主推产品/服务未定义")
    if (!input.knowledgeTitles.length && !sh.length) unknowns.push("缺少可引用的客户案例或证据素材")
  }
  // 中风险：选题缺老板专属证据也提示
  if (risk === "medium" && !sh.length) unknowns.push("选题缺少老板专属案例/原话作为信任证据")

  return {
    goal: deriveGoal(input),
    mode,
    riskLevel: risk,
    targetCustomer: p?.targetCustomer?.trim() || undefined,
    dealPath: p?.offer?.trim() || p?.deliveryGoal?.trim() ? `${p.offer?.trim() || ""} → ${p.deliveryGoal?.trim() || ""}`.trim() : undefined,
    rationale: input.topicSelection?.rationale?.trim() || undefined,
    knownFacts,
    unknowns,
    assumptions: [],
    nextAction: mode === "discovery_exploration"
      ? "补充关键资料后再生成正式方案"
      : risk === "low" ? "直接交付，无需追问" : "可按假设交付，复核最薄弱假设",
    classifiedBy: "rule",
    classifiedAt: new Date().toISOString(),
  }
}

/** 校验并合并 LLM 精化结果；丢弃 LLM 试图写入的 knownFacts（铁律）。 */
export function sanitizeLLMRefinement(
  skeleton: TaskSpec,
  refinement: {
    mode?: CollaborationMode
    unknowns?: string[]
    assumptions?: Array<{ statement: string; impact: "low" | "medium" | "high" }>
    knownFacts?: unknown // 必须被丢弃
  },
): TaskSpec {
  const allowedModes: CollaborationMode[] = skeleton.riskLevel === "low"
    ? ["direct_delivery"]
    : skeleton.riskLevel === "medium"
      ? ["assumption_delivery"]
      : ["assumption_delivery", "discovery_exploration"]
  const mode = refinement.mode && allowedModes.includes(refinement.mode) ? refinement.mode : skeleton.mode
  return {
    ...skeleton,
    mode,
    unknowns: Array.isArray(refinement.unknowns) && refinement.unknowns.length
      ? refinement.unknowns.filter((u) => typeof u === "string" && u.trim()).slice(0, 6)
      : skeleton.unknowns,
    assumptions: Array.isArray(refinement.assumptions)
      ? refinement.assumptions.filter((a) => a && a.statement).slice(0, 4)
      : skeleton.assumptions,
    // knownFacts 永远不被 LLM 覆盖
    knownFacts: skeleton.knownFacts,
    classifiedBy: "llm",
    classifiedAt: new Date().toISOString(),
  }
}

/** 构建给 LLM 的精化 prompt（仅判断类字段）。 */
export function buildTaskSpecLLMPrompt(spec: TaskSpec): string {
  return [
    "你是任务风险判断助手。只做判断，不得编造任何事实、客户案例或数字。",
    `已知事实（来自真实上下文，不可增改）：${spec.knownFacts.map((f) => f.statement).join("；") || "无"}`,
    `风险等级（规则给出，仅供参考）：${spec.riskLevel}`,
    `当前模式候选：${spec.riskLevel === "low" ? "direct_delivery" : spec.riskLevel === "medium" ? "assumption_delivery" : "assumption_delivery 或 discovery_exploration"}`,
    "请输出 JSON：{ mode, unknowns: string[], assumptions: [{statement, impact}] }。",
    "禁止输出 knownFacts、禁止输出任何数字指标、禁止编造客户反馈。unknowns 描述信息缺口，assumptions 描述为了交付而做的合理假设。",
  ].join("\n")
}
```

- [ ] **Step 4: 运行测试确认通过**

Run (from `apps/web`):
```bash
pnpm vitest run __tests__/unit/task-spec.test.ts 2>&1 | tail -15
```
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck**

Run (from `apps/web`):
```bash
pnpm typecheck 2>&1 | grep -i "task-spec" || echo "no task-spec errors"
```
Expected: 无 task-spec 相关错误。

- [ ] **Step 6: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/lib/task-spec.ts apps/web/__tests__/unit/task-spec.test.ts
git commit -m "feat(aim): add task-spec module (risk/mode classification + LLM guard)"
```

---

## Task 3: TaskSpec LLM 精化 + 降级接入 AIM 生成流

**Files:**
- Create: `apps/web/src/lib/task-spec-llm.ts`（LLM 精化 + 降级，独立可测）
- Modify: `apps/web/src/lib/aim-generate-validate.ts`
- Modify: `apps/web/src/lib/aim-generator.ts`
- Modify: `apps/web/src/lib/aim-agent-handlers.ts`

- [ ] **Step 1: 写失败测试 `__tests__/unit/task-spec.test.ts` 追加 LLM 降级用例**

在现有 test 文件末尾追加（注意：保留 Task2 已有内容）：

```typescript
import { refineTaskSpec, type LLMRefineClient } from "@/lib/task-spec-llm"

describe("refineTaskSpec 降级行为", () => {
  it("LLM 失败时退回骨架并标记 rule_fallback，任务不中断", async () => {
    const failingClient: LLMRefineClient = { complete: async () => { throw new Error("LLM down") } }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, agentId: "business_diagnosis" })
    const result = await refineTaskSpec(skeleton, { client: failingClient, enabled: true })
    expect(result.classifiedBy).toBe("rule_fallback")
    expect(result.mode).toBe(skeleton.mode)
  })
  it("enabled=false 时直接返回骨架(classifiedBy=rule)", async () => {
    const skeleton = buildTaskSpecSkeleton(baseInput)
    const result = await refineTaskSpec(skeleton, { enabled: false })
    expect(result.classifiedBy).toBe("rule")
  })
  it("低风险任务不调用 LLM", async () => {
    let called = false
    const client: LLMRefineClient = { complete: async () => { called = true; return "{}" } }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, taskType: "polish_copy" })
    await refineTaskSpec(skeleton, { client, enabled: true })
    expect(called).toBe(false)
  })
  it("LLM 返回合法 JSON 时合并并标记 llm", async () => {
    const client: LLMRefineClient = {
      complete: async () => JSON.stringify({ mode: "discovery_exploration", unknowns: ["客户客单价区间"], assumptions: [{ statement: "主推中大型项目", impact: "high" }] }),
    }
    const skeleton = buildTaskSpecSkeleton({ ...baseInput, agentId: "business_diagnosis", project: null })
    const result = await refineTaskSpec(skeleton, { client, enabled: true })
    expect(result.classifiedBy).toBe("llm")
    expect(result.unknowns).toContain("客户客单价区间")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run __tests__/unit/task-spec.test.ts 2>&1 | tail -15`
Expected: FAIL（`task-spec-llm` 不存在）。

- [ ] **Step 3: 实现 `src/lib/task-spec-llm.ts`**

```typescript
import { buildTaskSpecLLMPrompt, sanitizeLLMRefinement, type TaskSpec } from "@/lib/task-spec"

export interface LLMRefineClient {
  complete(prompt: string): Promise<string>
}

export interface RefineOptions {
  client?: LLMRefineClient
  enabled: boolean
}

/**
 * 对骨架做 LLM 精化（仅风险非 low 时）。
 * 任何失败（无 client / 超时 / 解析失败 / 校验失败）都退回骨架，classifiedBy=rule_fallback。
 */
export async function refineTaskSpec(skeleton: TaskSpec, opts: RefineOptions): Promise<TaskSpec> {
  if (!opts.enabled) return skeleton
  if (skeleton.riskLevel === "low") return skeleton // 低风险不调用
  if (!opts.client) return { ...skeleton, classifiedBy: "rule_fallback" }

  try {
    const raw = await opts.client.complete(buildTaskSpecLLMPrompt(skeleton))
    const parsed = JSON.parse(raw)
    return sanitizeLLMRefinement(skeleton, parsed)
  } catch {
    return { ...skeleton, classifiedBy: "rule_fallback" }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run __tests__/unit/task-spec.test.ts 2>&1 | tail -15`
Expected: PASS（含降级用例）。

- [ ] **Step 5: 修改 `aim-generate-validate.ts` 解析新字段**

在 `apps/web/src/lib/aim-generate-validate.ts` 的 `ParseGenerateBodyResult` interface（约 line 27-41）末尾追加两个字段：

```typescript
  topicSelectionId: string | undefined
  selectedTopicIndex: number | undefined
```

并在 `parseGenerateBody` 的 `return { ... }` 对象（约 line 73-88）末尾追加：

```typescript
    topicSelectionId: typeof body.topicSelectionId === "string" ? body.topicSelectionId.trim() || undefined : undefined,
    selectedTopicIndex:
      typeof body.selectedTopicIndex === "number" && Number.isInteger(body.selectedTopicIndex) && body.selectedTopicIndex >= 0
        ? body.selectedTopicIndex
        : undefined,
```

- [ ] **Step 6: 修改 `aim-generator.ts` — AimInput 增字段并在生成前构造 TaskSpec**

在 `apps/web/src/lib/aim-generator.ts` 的 `interface AimInput`（约 line 29-45）末尾追加：

```typescript
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec
```

- [ ] **Step 7: 修改 `aim-agent-handlers.ts` 落库 taskSpec/topicSelectionId/selectedTopicIndex**

在 `apps/web/src/lib/aim-agent-handlers.ts` 找到 `saveAimGenerationRecord` 内构建 `const data = { ... }`（约 line 1916-1936）。在该对象里，于 `topicTitle` 行之后追加：

```typescript
    topicSelectionId: context.topicSelectionId,
    selectedTopicIndex: context.selectedTopicIndex,
    taskSpec: context.taskSpec ?? undefined,
```

并在同文件的 `degradedData` 对象（约 line 1938-1948）同样追加这三行（保证降级路径留痕）。

然后在 `apps/web/src/lib/aim-agent-handlers.ts` 的 `interface AimGenerateContext`（**line 76-112**）中，于 `existingGenerationId?: string`（line 89）之后追加可选字段（这些字段会经 `buildAimGeneration` 的 `Omit<AimGenerateContext, ...>` 入参 → context → `saveAimGenerationRecord` 自动贯通，无需改 `buildAimGeneration` 签名）：

```typescript
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec
```

- [ ] **Step 8: 在生成路由中调用 TaskSpec 构造 + 精化**

打开 `apps/web/src/app/api/aim/generate/route.ts`。在调用 `generateAimContent` 之前，组装并精化 TaskSpec（具体行号在 step 实施时定位 `generateAimContent(` 调用处）。在其前插入：

```typescript
import { buildTaskSpecSkeleton } from "@/lib/task-spec"
import { refineTaskSpec } from "@/lib/task-spec-llm"

// ... 在已有 project / topicSelection 加载之后、generateAimContent 之前：
const taskSpecSkeleton = buildTaskSpecSkeleton({
  agentId: parsed.agentId,
  taskType: parsed.taskType,
  rawInput: parsed.rawInput,
  project: clientProject ? {
    name: clientProject.name,
    targetCustomer: clientProject.targetCustomer,
    industry: clientProject.industry,
    offer: clientProject.offer,
    deliveryGoal: clientProject.deliveryGoal,
  } : null,
  topicSelection: topicSelectionRow ? {
    title: parsed.topicTitle,
    rationale: parsed.topicRationale,
    sourceHighlights: Array.isArray(topicSelectionRow.sourceHighlights) ? topicSelectionRow.sourceHighlights as any : [],
  } : null,
  knowledgeTitles,
})
// 仅当 LLM 配置可用时 enabled=true；本步先恒为 true（走真实 getAgentLLM 由 step9 接线）
const taskSpec = await refineTaskSpec(taskSpecSkeleton, { enabled: !!process.env.OPENAI_API_KEY || true, client: undefined })
```

然后把 `taskSpec`、`parsed.topicSelectionId`、`parsed.selectedTopicIndex` 传入 `generateAimContent({...})` 调用对象。

> 注：`topicSelectionRow` 需在该路由按 `topicSelectionId` 查询（见 Step 9）；`knowledgeTitles` 复用该路由已有的知识库加载结果。若变量名不同，按实际命名对齐。

- [ ] **Step 9: 在 generate 路由按 topicSelectionId 加载选题行（用户隔离）**

在 `apps/web/src/app/api/aim/generate/route.ts` 知识库/项目加载的 `Promise.all` 区域，增加一项（若 `parsed.topicSelectionId` 存在）：

```typescript
  const topicSelectionRow = parsed.topicSelectionId
    ? await prisma.topicSelection.findFirst({
        where: { id: parsed.topicSelectionId, userId: user.id },
        select: { id: true, sourceHighlights: true, candidates: true },
      }).catch(() => null)
    : null
```

- [ ] **Step 10: typecheck + 测试**

Run (from `apps/web`):
```bash
pnpm typecheck 2>&1 | tail -20
pnpm vitest run __tests__/unit/task-spec.test.ts 2>&1 | tail -10
```
Expected: typecheck 无新增错误；测试全绿。

- [ ] **Step 11: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/lib/task-spec-llm.ts apps/web/src/lib/aim-generate-validate.ts apps/web/src/lib/aim-generator.ts apps/web/src/lib/aim-agent-handlers.ts apps/web/src/app/api/aim/generate/route.ts apps/web/__tests__/unit/task-spec.test.ts
git commit -m "feat(aim): wire TaskSpec (LLM refine + fallback) into AIM generation flow"
```

---

## Task 4: 交付契约按 mode 折叠/展开

**Files:**
- Modify: `apps/web/src/lib/aim-delivery-contract.ts`
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx` (DeliveryContractStrip ~line 912, DeliverableBubble ~line 667)

- [ ] **Step 1: 扩展 `aim-delivery-contract.ts` 输入输出**

在 `apps/web/src/lib/aim-delivery-contract.ts` 的 `AimDeliveryContractInput`（line 3-12）末尾追加：

```typescript
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
```

在 `AimDeliveryContract`（line 14-19）末尾追加：

```typescript
  assumptions?: { statement: string; impact: "low" | "medium" | "high" }[]
  unknowns?: string[]
  knownFacts?: { statement: string; source: string }[]
  expanded: boolean // 是否需要展开详情（低风险 false，其余 true）
```

在 `buildAimDeliveryContract` 函数体内 `return { ... }`（line 61-69）之前，根据 taskSpec 计算展开信息，并并入返回对象：

```typescript
  const spec = input.taskSpec
  const expanded = !!(spec && spec.mode !== "direct_delivery")
  const assumptions = spec?.assumptions?.slice(0, 2)
  const unknowns = spec?.unknowns
  const knownFacts = spec?.knownFacts
```

把 return 对象改为包含新字段：

```typescript
  return {
    task: { label: taskLabel, detail: taskDetail },
    evidence: { label: evidenceLabel, detail: evidenceDetail },
    status,
    next: {
      label: nextLabel,
      detail: input.isCurrentVersion ? "操作当前版本" : "建议返回当前版本",
    },
    assumptions,
    unknowns,
    knownFacts,
    expanded,
  }
```

低风险额外提示：在函数末尾、return 之前，若 `spec?.mode === "direct_delivery"`，把 `status.detail` 设为 `"已按现有资料直接完成。"`：

```typescript
  if (spec?.mode === "direct_delivery" && !input.degraded && input.qualityStatus !== "fail") {
    status = { ...status, detail: "已按现有资料直接完成。" }
  }
```

- [ ] **Step 2: 修改前端 `DeliveryContractStrip` 渲染可折叠详情**

在 `apps/web/src/app/(dashboard)/aim/page.tsx` 的 `DeliveryContractStrip`（约 line 912-942），在现有 4 列 grid 之后、组件 return 内，追加一个可折叠区块（仅在 `contract.expanded` 时显示假设/缺口；低风险不显示）：

```tsx
{contract.expanded && (
  <div className="col-span-2 mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground lg:col-span-4">
    {contract.assumptions && contract.assumptions.length > 0 && (
      <p className="mt-1"><span className="font-medium text-foreground">本次假设：</span>
        {contract.assumptions.map((a) => a.statement).join("；")}</p>
    )}
    {contract.unknowns && contract.unknowns.length > 0 && (
      <p className="mt-1"><span className="font-medium text-foreground">待确认：</span>{contract.unknowns.join("；")}</p>
    )}
    {contract.taskSpec?.mode === "discovery_exploration" && (
      <p className="mt-1 text-amber-600">信息不足，无法给出确定方案。补充关键资料后再生成正式方案。</p>
    )}
  </div>
)}
```

同时把 `DeliveryContractStrip` 入参的 `contract` 类型保持为 `ReturnType<typeof buildAimDeliveryContract>`（已自动含新字段）。在 `DeliverableBubble`（约 line 744-753）调用 `buildAimDeliveryContract({...})` 处，增加传参 `taskSpec: deliverables.taskSpec ?? null`（需确认 `AimGenerateResponse` 是否已带 taskSpec —— 见 Task 5 step 2 补类型）。

- [ ] **Step 3: typecheck + build**

Run (from `apps/web`):
```bash
pnpm typecheck 2>&1 | tail -20
```
Expected: 无新增错误。

- [ ] **Step 4: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/lib/aim-delivery-contract.ts apps/web/src/app/\(dashboard\)/aim/page.tsx
git commit -m "feat(aim): delivery contract collapses/expands by TaskSpec mode"
```

---

## Task 5: API 客户端 + 响应类型补 taskSpec

**Files:**
- Modify: `apps/web/src/lib/api/client.ts`

- [ ] **Step 1: 在 `AimGenerateRequest` 增加 topicSelectionId/selectedTopicIndex**

在 `apps/web/src/lib/api/client.ts` 的 `AimGenerateRequest`（约 line 1274-1288）末尾追加：

```typescript
  topicSelectionId?: string
  selectedTopicIndex?: number
```

- [ ] **Step 2: 在 `AimGeneration` 响应类型补字段**

在同文件搜索 `export interface AimGeneration`，追加：

```typescript
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
```

- [ ] **Step 3: 新增 ContentOutcome 客户端函数**

在 `apps/web/src/lib/api/client.ts` 中 `updateAimWorkflowStatus`（约 line 1560）之后追加：

```typescript
export interface ContentOutcomeInput {
  collectWindowDay: 7 | 14 | 30
  platform?: string
  publishedAt?: string
  qualifiedCommentCount?: number | null
  dmCount?: number | null
  qualifiedLeadCount?: number | null
  appointmentCount?: number | null
  dealCount?: number | null
  revenue?: number | null
  views?: number | null
  likes?: number | null
  comments?: number | null
  saves?: number | null
  shares?: number | null
  audienceFeedback?: string
  userVerdict?: string
}

export async function upsertContentOutcome(generationId: string, body: ContentOutcomeInput) {
  return request(`/api/aim/history/${generationId}/outcome`, {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

export async function getContentOutcome(generationId: string) {
  return request<{ outcomes: unknown[] }>(`/api/aim/history/${generationId}/outcome`, { method: "GET" })
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck 2>&1 | grep -i "client.ts" || echo "client.ts clean"`
Expected: 无 client.ts 错误。

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/lib/api/client.ts
git commit -m "feat(aim): client types for TaskSpec + ContentOutcome API"
```

---

## Task 6: ContentOutcome API 路由（GET/PUT，用户隔离）

**Files:**
- Create: `apps/web/src/app/api/aim/history/[id]/outcome/route.ts`
- Test: `apps/web/__tests__/unit/content-outcome.test.ts`

- [ ] **Step 1: 写失败测试（聚焦去重 + null 语义 + 隔离）**

`apps/web/__tests__/unit/content-outcome.test.ts`：

```typescript
import { describe, it, expect } from "vitest"
import { sanitizeOutcomeBody } from "@/app/api/aim/history/[id]/outcome/route"

describe("sanitizeOutcomeBody", () => {
  it("未填写字段为 null，不转为 0", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 3 })
    expect(out.dmCount).toBe(3)
    expect(out.qualifiedLeadCount).toBeNull()
    expect(out.views).toBeNull()
  })
  it("空字符串/undefined -> null（绝不当 0）", () => {
    const out = sanitizeOutcomeBody({ collectWindowDay: 7, views: "", revenue: undefined })
    expect(out.views).toBeNull()
    expect(out.revenue).toBeNull()
  })
  it("非法 collectWindowDay 拒绝", () => {
    expect(() => sanitizeOutcomeBody({ collectWindowDay: 5 })).toThrow()
    expect(() => sanitizeOutcomeBody({ collectWindowDay: "7" as any })).toThrow()
  })
  it("显式 0 保留为 0（用户确实填了 0）", () => {
    expect(sanitizeOutcomeBody({ collectWindowDay: 7, dmCount: 0 }).dmCount).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run __tests__/unit/content-outcome.test.ts 2>&1 | tail -10`
Expected: FAIL（路由模块未导出 sanitizeOutcomeBody）。

- [ ] **Step 3: 实现路由 `src/app/api/aim/history/[id]/outcome/route.ts`**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import type { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

type NullableInt = number | null
type NullableDecimal = Prisma.Decimal | null

export interface SanitizedOutcome {
  collectWindowDay: number
  platform: string | null
  publishedAt: Date | null
  qualifiedCommentCount: NullableInt
  dmCount: NullableInt
  qualifiedLeadCount: NullableInt
  appointmentCount: NullableInt
  dealCount: NullableInt
  revenue: NullableDecimal
  views: NullableInt
  likes: NullableInt
  comments: NullableInt
  saves: NullableInt
  shares: NullableInt
  audienceFeedback: string | null
  userVerdict: string | null
}

/** 将任意输入归一为「显式数字 | null」，未填写/null/空串一律 null，绝不 0。 */
function toNullableInt(value: unknown): NullableInt {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Math.trunc(Number(value))
  return null
}

function toNullableDecimal(value: unknown): NullableDecimal {
  if (typeof value === "number" && Number.isFinite(value)) return new Prisma.Decimal(value)
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return new Prisma.Decimal(value)
  return null
}

export function sanitizeOutcomeBody(body: Record<string, unknown>): SanitizedOutcome {
  const collectWindowDay = Number(body.collectWindowDay)
  if (![7, 14, 30].includes(collectWindowDay)) {
    throw new Error("collectWindowDay 必须是 7/14/30")
  }
  return {
    collectWindowDay,
    platform: typeof body.platform === "string" && body.platform.trim() ? body.platform.trim().slice(0, 40) : null,
    publishedAt: typeof body.publishedAt === "string" && body.publishedAt ? new Date(body.publishedAt) : null,
    qualifiedCommentCount: toNullableInt(body.qualifiedCommentCount),
    dmCount: toNullableInt(body.dmCount),
    qualifiedLeadCount: toNullableInt(body.qualifiedLeadCount),
    appointmentCount: toNullableInt(body.appointmentCount),
    dealCount: toNullableInt(body.dealCount),
    revenue: toNullableDecimal(body.revenue),
    views: toNullableInt(body.views),
    likes: toNullableInt(body.likes),
    comments: toNullableInt(body.comments),
    saves: toNullableInt(body.saves),
    shares: toNullableInt(body.shares),
    audienceFeedback: typeof body.audienceFeedback === "string" ? body.audienceFeedback.slice(0, 5000) : null,
    userVerdict: typeof body.userVerdict === "string" ? body.userVerdict.slice(0, 1000) : null,
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request)
  if ("error" in auth) return authErrorResponse(auth)
  const { user } = auth
  const { id } = await ctx.params

  // 先校验该 generation 归属当前用户
  const owned = await prisma.aimGeneration.findFirst({ where: { id, userId: user.id }, select: { id: true, topicSelectionId: true, projectId: true } })
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 })

  const outcomes = await prisma.contentOutcome.findMany({
    where: { generationId: id, userId: user.id },
    orderBy: { collectWindowDay: "asc" },
  })
  return NextResponse.json({ outcomes, topicSelectionId: owned.topicSelectionId, projectId: owned.projectId })
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request)
  if ("error" in auth) return authErrorResponse(auth)
  const { user } = auth
  const { id } = await ctx.params

  const owned = await prisma.aimGeneration.findFirst({ where: { id, userId: user.id }, select: { id: true, topicSelectionId: true, projectId: true } })
  if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  let sanitized: SanitizedOutcome
  try {
    sanitized = sanitizeOutcomeBody(body)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // upsert 靠 unique([userId, generationId, collectWindowDay]) 去重
  const outcome = await prisma.contentOutcome.upsert({
    where: { userId_generationId_collectWindowDay: { userId: user.id, generationId: id, collectWindowDay: sanitized.collectWindowDay } },
    create: {
      userId: user.id,
      generationId: id,
      topicSelectionId: owned.topicSelectionId,
      projectId: owned.projectId,
      ...sanitized,
    },
    update: { ...sanitized },
  })
  return NextResponse.json({ outcome })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run __tests__/unit/content-outcome.test.ts 2>&1 | tail -10`
Expected: PASS。

- [ ] **Step 5: 校验 authenticateRequest / authErrorResponse 的真实签名**

在 step 实施时，打开 `apps/web/src/lib/user-auth.ts` 确认：
- `authenticateRequest(request)` 返回 `{ user }` 或 `{ error }`（按实际形态调整 `"error" in auth` 判断）。
- `authErrorResponse(auth)` 接受 auth 结果返回 Response。
若签名不同，按实际调整（aim 路由 `history/[id]/route.ts` 是现成参照，可对照其鉴权写法）。

- [ ] **Step 6: typecheck**

Run: `pnpm typecheck 2>&1 | grep -i "outcome/route" || echo "outcome route clean"`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/app/api/aim/history/\[id\]/outcome/route.ts apps/web/__tests__/unit/content-outcome.test.ts
git commit -m "feat(aim): ContentOutcome GET/PUT route with null-safe sanitization + isolation"
```

---

## Task 7: 消除选题伪精确评分（三档判断）

**Files:**
- Modify: `apps/web/src/lib/topic-validation.ts`
- Modify: `apps/web/src/lib/topic-generation.ts` (normalizeScoreBreakdown ~line 391, fallbackTopicCards ~line 350)
- Modify: `apps/web/src/lib/topic-daily-report.ts` (scoreOf ~line 37)
- Test: `apps/web/__tests__/unit/topic-verdict.test.ts`

- [ ] **Step 1: 写失败测试**

`apps/web/__tests__/unit/topic-verdict.test.ts`：

```typescript
import { describe, it, expect } from "vitest"
// normalizeScoreBreakdown 将在 step3 中从 @/lib/topic-generation 导出（当前为文件内私有，故先失败）
import { normalizeScoreBreakdown } from "@/lib/topic-generation"

describe("选题评分消除伪精确", () => {
  it("缺分时各维度为 null 而非默认 80/75", () => {
    const r = normalizeScoreBreakdown(undefined)
    expect(r.projectFit).toBeNull()
    expect(r.viralHook).toBeNull()
  })
  it("有分时正常 clamp", () => {
    const r = normalizeScoreBreakdown({ projectFit: 88, contentValue: 92, viralHook: 70, conversionFit: 60, feasibility: 80 })
    expect(r.projectFit).toBe(88)
  })
})
```

- [ ] **Step 2: 运行确认失败（或模块路径待调整）**

Run: `pnpm vitest run __tests__/unit/topic-verdict.test.ts 2>&1 | tail -10`
Expected: FAIL。

- [ ] **Step 3: 改 `topic-generation.ts` — 缺分返回 null 而非默认高分**

在 `apps/web/src/lib/topic-generation.ts`：
1. 把 `normalizeScoreBreakdown` 改为允许 null（导出供测试，文件内新增 `export`）：

```typescript
export type ScoreBreakdownNullable = {
  projectFit: number | null
  contentValue: number | null
  viralHook: number | null
  conversionFit: number | null
  feasibility: number | null
}

export function normalizeScoreBreakdown(breakdown: TopicCard["scoreBreakdown"]): ScoreBreakdownNullable {
  return {
    projectFit: breakdown ? clampScore(breakdown.projectFit) : null,
    contentValue: breakdown ? clampScore(breakdown.contentValue) : null,
    viralHook: breakdown ? clampScore(breakdown.viralHook) : null,
    conversionFit: breakdown ? clampScore(breakdown.conversionFit) : null,
    feasibility: breakdown ? clampScore(breakdown.feasibility) : null,
  }
}
```

2. `clampScore` 保持，但当入参非有限数字返回 null —— 改签名为：

```typescript
function clampScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}
```

3. `weightedScore` 接受 nullable，任一维度 null 则返回 null：

```typescript
function weightedScore(breakdown: ScoreBreakdownNullable): number | null {
  const vals = [breakdown.projectFit, breakdown.contentValue, breakdown.viralHook, breakdown.conversionFit, breakdown.feasibility]
  if (vals.some((v) => v === null)) return null
  return Math.floor(
    (breakdown.projectFit as number) * 0.25
    + (breakdown.contentValue as number) * 0.25
    + (breakdown.viralHook as number) * 0.2
    + (breakdown.conversionFit as number) * 0.15
    + (breakdown.feasibility as number) * 0.15,
  )
}
```

4. `verdictFor` 改为：score 为 null → 不再硬套分数阈值，返回 `undefined`（让前台走三档业务判断）；保留旧 strong/usable/observe/revise 仅在 score 非空时计算：

```typescript
function verdictFor(score: number | null, breakdown: ScoreBreakdownNullable): NonNullable<TopicCard["reviewVerdict"]> | undefined {
  if (score === null) return undefined
  const vals = Object.values(breakdown)
  if (vals.some((v) => v !== null && (v as number) < 40)) return "revise"
  if (score >= 80) return "strong"
  if (score >= 65) return "usable"
  return "observe"
}
```

5. `normalizeTopicCards` 内：`score` 现在可能为 null，`reviewVerdict` 可能 undefined —— 在返回对象里照原样带出（`score`、`reviewVerdict` 字段本就 optional）。

6. `fallbackTopicCards`：移除硬编码 breakdown，改为不带分、带「证据不足」标记：

```typescript
      scoreBreakdown: undefined,
      scoreReason: "证据不足：缺少目标客户/案例数据，暂不给出评分。",
      revisionAdvice: "补充客户原话、案例或数据后再评估。",
```

（删除原 projectFit:76 等行；defamiliarization 的 noveltyScore 也移除或设 undefined）

- [ ] **Step 4: 同步 `topic-validation.ts` 适配 nullable breakdown**

在 `apps/web/src/lib/topic-validation.ts` 把 `TopicScoreBreakdownSchema` 的 `.min(0).max(100)` 数值保持，但允许各维度 `.nullable()`，并在 `TopicCardSchema` 的 `score`/`scoreBreakdown` 保持 `.optional()` 不变（兼容旧数据）。具体：

```typescript
export const TopicScoreBreakdownSchema = z.object({
  projectFit: z.number().min(0).max(100).nullable().optional(),
  contentValue: z.number().min(0).max(100).nullable().optional(),
  viralHook: z.number().min(0).max(100).nullable().optional(),
  conversionFit: z.number().min(0).max(100).nullable().optional(),
  feasibility: z.number().min(0).max(100).nullable().optional(),
})
```

新增三档 verdict 常量供前端复用：

```typescript
export const BUSINESS_VERDICTS = ["值得主推", "补证据再发", "暂不建议"] as const
export type BusinessVerdict = (typeof BUSINESS_VERDICTS)[number]
```

- [ ] **Step 5: 改 `topic-daily-report.ts` — 缺分不当 0**

`apps/web/src/lib/topic-daily-report.ts` 的 `scoreOf`（约 line 37-39）改为：

```typescript
function scoreOf(card: ApiTopicCard): number | null {
  return typeof card.score === "number" ? card.score : null
}
```

`getLeadCard` / `scoreDecisionReason` 内凡用 `score ?? 0` 处，改为：无分卡片排末位，reason 文案改「该选题暂无评分（证据不足）」。具体把 `scoreDecisionReason` 里的 `总分 ${card.score ?? 0}` 改为 `card.score ? \`总分 ${card.score}\` : "证据不足，未给评分"`。

- [ ] **Step 6: 更新测试断言（适配 nullable 后的真实行为）**

回到 `topic-verdict.test.ts` 把 `expect(r.projectFit).toBeNull()` 保持（已正确）。运行：

Run: `pnpm vitest run __tests__/unit/topic-verdict.test.ts 2>&1 | tail -10`
Expected: PASS。

- [ ] **Step 7: typecheck（重点检查 topic-generation.ts 派生类型一致性）**

Run: `pnpm typecheck 2>&1 | grep -iE "topic-generation|topic-daily|topic-validation" || echo "topic files clean"`
Expected: 无错误。若 `normalizeTopicCards` 返回类型因 score nullable 报错，按实际 TS 提示修返回对象。

- [ ] **Step 8: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/lib/topic-generation.ts apps/web/src/lib/topic-validation.ts apps/web/src/lib/topic-daily-report.ts apps/web/__tests__/unit/topic-verdict.test.ts
git commit -m "feat(topic): replace pseudo-precision scores with nullable/evidence-insufficient verdict"
```

---

## Task 8: 选题 → AIM 跳转补全关联

**Files:**
- Modify: `apps/web/src/app/(dashboard)/topic-planning/page.tsx` (jumpToAim ~line 587)
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx` (读 searchParams ~line 948, 传参 ~line 2094)

- [ ] **Step 1: `jumpToAim` 带 topicSelectionId + selectedTopicIndex**

在 `apps/web/src/app/(dashboard)/topic-planning/page.tsx` 的 `jumpToAim`（约 line 587-595）里，在 `router.push` 前增加：

```typescript
  if (topicSelectionId) params.set("topicSelectionId", topicSelectionId)
  if (typeof selectedIndex === "number") params.set("selectedTopicIndex", String(selectedIndex))
```

（`topicSelectionId` / `selectedIndex` 取自该函数已有作用域内的选题批次 id 与当前选用索引；若变量名不同按实际对齐。`jumpToAim` 签名需确保能拿到 topicSelectionId —— 若当前签名只有 `card`，则改为 `jumpToAim(card, topicSelectionId, selectedIndex)` 并在调用处补传。）

- [ ] **Step 2: AIM 页读取并透传**

在 `apps/web/src/app/(dashboard)/aim/page.tsx` 约 line 948（读取 searchParams 处）增加：

```typescript
  const sourceTopicSelectionId = searchParams.get("topicSelectionId") || undefined
  const sourceSelectedTopicIndex = Number(searchParams.get("selectedTopicIndex"))
  const validSelectedTopicIndex = Number.isFinite(sourceSelectedTopicIndex) ? sourceSelectedTopicIndex : undefined
```

在 `generateAimContent({...})` 调用处（约 line 2094-2104）传入：

```typescript
    topicSelectionId: sourceTopicSelectionId,
    selectedTopicIndex: validSelectedTopicIndex,
```

- [ ] **Step 3: typecheck + build**

Run: `pnpm typecheck 2>&1 | grep -iE "topic-planning|aim/page" || echo "pages clean"`
Expected: 无新增错误。

- [ ] **Step 4: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/app/\(dashboard\)/topic-planning/page.tsx apps/web/src/app/\(dashboard\)/aim/page.tsx
git commit -m "feat(aim): pass topicSelectionId/selectedTopicIndex from topic-planning to AIM"
```

---

## Task 9: 反馈事件枚举扩展

**Files:**
- Modify: `apps/web/src/app/api/aim/runs/[runId]/events/route.ts`

- [ ] **Step 1: 定位现有合法事件集合**

打开 `apps/web/src/app/api/aim/runs/[runId]/events/route.ts`，找到校验 `event` 的合法值集合（应含 `copied | revised | accepted`）。

- [ ] **Step 2: 扩展枚举 + 接受可选 reason**

把合法事件集合扩展为（补充指令 §五）：

```typescript
const VALID_EVENTS = new Set([
  "accepted", "partially_satisfied", "rewrite_requested", "rejected",
  "copied", "edited", "published", "retrospected",
])
```

在写入 `AimRunEvent` 时，若 body 含 `reason`，放入 `metadata: { ...metadata, reason }`。reason 合法集合：

```typescript
const VALID_REASONS = new Set([
  "fact_inaccurate", "tone_mismatch", "structure_mismatch", "too_generic",
  "conversion_weak", "missing_evidence", "other",
])
```

非法 reason 忽略（不报错，只是不写）。`event VarChar(24)` 注意 `partially_satisfied`(18) / `rewrite_requested`(17) / `retrospected`(13) 均在 24 内，无需迁移。

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck 2>&1 | grep -i "events/route" || echo "events route clean"`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/app/api/aim/runs/\[runId\]/events/route.ts
git commit -m "feat(aim): extend run-event enum + optional feedback reason"
```

---

## Task 10: 复盘录入对接 ContentOutcome（最小前端）

**Files:**
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx` (复盘/登记对话框 ~line 2791, handleSubmitRecordDialog ~line 2312)

- [ ] **Step 1: 在复盘对话框增加结构化结果录入（三组）**

在 `apps/web/src/app/(dashboard)/aim/page.tsx` 的发布/复盘 Dialog（约 line 2791-2903）内，于现有字段之后增加三组输入，绑定本地 state `outcomeForm`：

```tsx
// 三组录入（仅展示关键结构，绑定 onChange 更新 outcomeForm）
// 第一组 商业结果：dmCount / qualifiedLeadCount / appointmentCount / dealCount / revenue
// 第二组 内容信号：views / saves / comments / shares
// 第三组 用户反馈：audienceFeedback（textarea）
```

并在组件顶部 state 增加：

```tsx
const [outcomeForm, setOutcomeForm] = useState<Record<string, string>>({})
```

（用字符串 state，提交时由 API 的 sanitizeOutcomeBody 归一，空串→null。）

- [ ] **Step 2: 提交时调用 upsertContentOutcome**

在 `handleSubmitRecordDialog`（约 line 2312-2366）或单独 handler，发布/复盘提交后追加：

```tsx
  const hasOutcome = Object.values(outcomeForm).some((v) => v && v.trim())
  if (hasOutcome && recordDialog.generationId) {
    await upsertContentOutcome(recordDialog.generationId, {
      collectWindowDay: 7,
      platform: publishForm.platform || undefined,
      publishedAt: publishForm.publishedAt,
      dmCount: outcomeForm.dmCount ? Number(outcomeForm.dmCount) : null,
      qualifiedLeadCount: outcomeForm.qualifiedLeadCount ? Number(outcomeForm.qualifiedLeadCount) : null,
      appointmentCount: outcomeForm.appointmentCount ? Number(outcomeForm.appointmentCount) : null,
      dealCount: outcomeForm.dealCount ? Number(outcomeForm.dealCount) : null,
      revenue: outcomeForm.revenue ? Number(outcomeForm.revenue) : null,
      views: outcomeForm.views ? Number(outcomeForm.views) : null,
      saves: outcomeForm.saves ? Number(outcomeForm.saves) : null,
      comments: outcomeForm.comments ? Number(outcomeForm.comments) : null,
      shares: outcomeForm.shares ? Number(outcomeForm.shares) : null,
      audienceFeedback: outcomeForm.audienceFeedback || undefined,
    }).catch(() => {}) // 失败不阻断主发布流程
  }
```

并在文件顶部 `import { upsertContentOutcome } from "@/lib/api/client"`。

- [ ] **Step 3: 发布前判断从 taskSpec 预填（用户可改）**

在打开 decision 对话框的 `openRecordDialog`（约 line 2277-2290）处，不再清空 decisionForm，改为从 `generation.taskSpec` 预填：

```tsx
  const spec = generation?.taskSpec
  setDecisionForm({
    summary: spec?.realProblem || spec?.goal || "",
    targetUser: spec?.targetCustomer || "",
    expectedSignal: spec?.desiredAction || "",
    confidence: spec?.riskLevel === "high" ? "低" : spec?.riskLevel === "medium" ? "中" : "高",
  })
```

- [ ] **Step 4: typecheck + build**

Run: `pnpm typecheck 2>&1 | grep -i "aim/page" || echo "aim page clean"`
Expected: 无新增错误。

- [ ] **Step 5: Commit**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add apps/web/src/app/\(dashboard\)/aim/page.tsx
git commit -m "feat(aim): retro dialog records structured ContentOutcome + prefill from taskSpec"
```

---

## Task 11: 全量验证 + 收尾

- [ ] **Step 1: 全量单测**

Run (from `apps/web`):
```bash
pnpm vitest run __tests__/unit/ 2>&1 | tail -30
```
Expected: 本次新增的 task-spec / content-outcome / topic-verdict 全绿；不破坏既有单测（若有与本次无关的既有失败，记录在收尾报告，不强行修）。

- [ ] **Step 2: 全量 typecheck**

Run: `pnpm typecheck 2>&1 | tail -25`
Expected: 与改动相关的文件零错误。

- [ ] **Step 3: 生产构建**

Run: `pnpm build 2>&1 | tail -30`
Expected: build 成功（Next.js 16）。

- [ ] **Step 4: 迁移已在 Task1 跑过；再次确认 DB schema 一致**

Run (from `apps/web`):
```bash
DATABASE_URL='<按 .env.local 真实值>' npx prisma migrate status --schema prisma/schema.prisma 2>&1 | tail -10
```
Expected: 所有迁移已应用，无 drift。

- [ ] **Step 5: 人工冒烟（手动，记录到收尾报告）**

- 在选题工作台选用一个选题 → 跳 AIM → 生成：确认 `AimGeneration` 行的 `topicSelectionId`/`selectedTopicIndex`/`taskSpec` 已落库（查 DB）。
- 高风险任务（agentId=business_diagnosis）+ 无项目资料 → 确认交付条显示「信息不足」而非伪确定方案。
- 低风险（polish_copy）→ 确认无追问、状态显示「已按现有资料直接完成」。
- 复盘录入 → PUT outcome → 确认 DB 中未填字段为 NULL 非 0，重复 PUT 同 window 不产生新行。

- [ ] **Step 6: 收尾 commit + 报告**

```bash
cd /Users/xiangyu/Desktop/明动aim智能体/mingyuan
git add -A
git commit -m "test(aim): verify Sprint1+2 full build/typecheck/test green"
```

输出收尾报告：改动文件清单、迁移文件、测试结果、仍未完成的风险（Sprint3/4 待办、可能的既有无关失败）。

---

## 风险与不做项（明确边界）

- **本次不做**：Sprint 3 偏好/经验候选库（需新建表）、Sprint 4 探索模式智能体接入、市场雷达重做、平台自动数据采集、多智能体架构、独立平行工作台。
- **降级保证**：TaskSpec LLM 失败 → `rule_fallback`，AIM 任务照常执行（验收 §10）。
- **零 Mock**：所有 LLM 走真实 `getAgentLLM`（Task3 step8 的 client 接线在实施时接入，本计划用可注入 `LLMRefineClient` 便于测试，真实路径注入 `getAgentLLM` 的 complete 包装）。
- **兼容**：保留 `score`/`scoreBreakdown` 字段不删列，旧数据可读；前台不再当市场预测展示。
