# AIM Content Ops Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AIM 从“生成文案的工作台”升级成“素材进入、选题判断、图文策划、复用资产沉淀”的轻量内容生产系统。

**Architecture:** 不另起 RedBox 式桌面工作台，不引入新依赖。沿用现有 `mingyuan/apps/web` 的知识库、选题中心、AIM 生成接口、小红书图文格式、AI HOT 和历史侧边栏，把能力串成一条更明确的内容操作链路。

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7, existing shadcn/ui, existing LLM client, existing JSON fields.

## Global Constraints

- 不做完整 RedBox 克隆；只吸收“收藏 / 素材 / 选题 / 图文资产”的开发理念。
- 不增加新依赖；先用现有 API、schema、prompt 和 UI。
- 不做数据库迁移，除非某一步明确证明现有 Json/Knowledge/TopicSelection 无法承载。
- 小红书 v1 只输出图文方案和图片提示词，不接真实图片生成。
- 热点中心继续负责“热点值不值得看”；选题中心负责“进入内容生产后值不值得做”。
- 生产流程不得使用 mock、fake、demo fallback。

---

## Operating Assumptions

1. AIM 的主线应该是：素材进入 -> 知识库归档 -> 选题评分 -> 内容形态选择 -> 小红书/公众号/视频产物 -> 历史复用。
2. 你现在最需要的不是更大的 Agent 数量，而是让每个 Agent 的产物能被下游继续使用。
3. RedBox 值得借鉴的是工作流思想，不是它的完整产品形态：先收藏内容，再变成知识，再变成创作任务。
4. `xiaohongshu_post` 已有视觉导演提示词，下一步重点是把它接入选题和素材上下文，而不是重写一个新模块。

## File Map

- Modify: `mingyuan/apps/web/src/lib/aim-agent-handlers.ts`
  - 强化 `xiaohongshu_post` 的输入上下文和输出结构。
- Modify: `mingyuan/apps/web/src/lib/aim-generator.ts`
  - 确认多格式解析不会破坏小红书图文方案。
- Modify: `mingyuan/apps/web/src/app/(dashboard)/topic-planning/page.tsx`
  - 让选题卡可以直接进入“小红书图文方案”。
- Modify: `mingyuan/apps/web/src/lib/topic-generation.ts`
  - 把“素材来源”和“小红书图文适配度”写进选题生成约束。
- Modify: `mingyuan/apps/web/src/lib/topic-daily-report.ts`
  - 日报主推理由补充“可转小红书图文”的判断。
- Modify: `mingyuan/apps/web/src/components/layout/app-sidebar.tsx`
  - 保持 Codex 式智能体历史分组，后续可把小红书图文历史单独折叠展示。
- Add/Modify tests under `mingyuan/apps/web/__tests__/unit/`
  - 覆盖 prompt、schema 兼容、选题到 AIM 跳转参数。

---

## Phase 1: 固化内容生产链路

### Task 1: 定义 AIM 内容生产状态模型

**Files:**
- Modify: `mingyuan/apps/web/src/types/api.ts`
- Modify: `mingyuan/apps/web/src/lib/api/client.ts`
- Test: `mingyuan/apps/web/__tests__/unit/topic-scoring.test.ts`

**Interfaces:**
- Produces: `ApiTopicCard.contentOpsStage?: "source" | "topic" | "draft" | "visual_plan" | "published_asset"`
- Consumes: existing `ApiTopicCard`, `TopicCardSchema`

- [ ] **Step 1: Write the failing test**

Add a test asserting old cards still normalize, and new cards can carry:

```ts
contentOpsStage: "topic"
```

Run:

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/topic-scoring.test.ts
```

Expected: FAIL because `contentOpsStage` is not accepted or preserved yet.

- [ ] **Step 2: Implement minimal schema/type support**

Add one optional string enum field to `ApiTopicCard` and `TopicCardSchema`. Do not create a new table.

- [ ] **Step 3: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/topic-scoring.test.ts
pnpm exec eslint src/types/api.ts src/lib/topic-validation.ts
```

Expected: PASS.

### Task 2: 给选题卡补“素材可追溯”字段

**Files:**
- Modify: `mingyuan/apps/web/src/lib/topic-validation.ts`
- Modify: `mingyuan/apps/web/src/lib/topic-generation.ts`
- Test: `mingyuan/apps/web/__tests__/unit/topic-scoring.test.ts`

**Interfaces:**
- Produces: `sourceTrace?: Array<{ title: string; category: string; reason: string }>`
- Consumes: existing `topicSources`

- [ ] **Step 1: Write the failing test**

Assert `normalizeTopicCards` accepts a card with one `sourceTrace` item, and legacy cards default to `[]`.

- [ ] **Step 2: Update prompt**

In `buildTopicSystemPrompt`, require every card to explain which source material it used and why. Keep it short: max 3 source items per card.

- [ ] **Step 3: Normalize safely**

If the model omits `sourceTrace`, set it to `[]`. If it returns more than 3 items, keep the first 3.

- [ ] **Step 4: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/topic-scoring.test.ts
pnpm exec eslint src/lib/topic-generation.ts src/lib/topic-validation.ts
```

Expected: PASS.

---

## Phase 2: 选题中心变成创作任务入口

### Task 3: 选题卡增加“小红书图文方案”入口

**Files:**
- Modify: `mingyuan/apps/web/src/app/(dashboard)/topic-planning/page.tsx`
- Modify: `mingyuan/apps/web/src/lib/api/client.ts`

**Interfaces:**
- Consumes: existing selected topic card
- Produces: navigation to `/aim` with `agent=content_producer`, `format=xiaohongshu_post`, `topicTitle`, `topicRationale`

- [ ] **Step 1: Add a focused UI test if route helpers already exist**

If there is no existing component test harness for this page, skip adding a new framework. Use lint and manual route verification instead.

- [ ] **Step 2: Add the button**

On each topic card, add a secondary action:

```txt
生成小红书图文
```

It should sit beside existing “采用这个选题 / 去 AIM 写文案” flow. It must not disable `revise` cards; show the existing visual warning only.

- [ ] **Step 3: Preserve current flow**

Do not remove or rename the existing primary action. The new button only preselects the small-red-book output format.

- [ ] **Step 4: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec eslint 'src/app/(dashboard)/topic-planning/page.tsx' src/lib/api/client.ts
curl -I http://localhost:3000/topic-planning
```

Expected: eslint PASS; page returns 200 when local dev server is running.

### Task 4: 选题日报补“小红书优先级”

**Files:**
- Modify: `mingyuan/apps/web/src/lib/topic-daily-report.ts`
- Test: `mingyuan/apps/web/__tests__/unit/topic-daily-report.test.ts`

**Interfaces:**
- Consumes: `scoreBreakdown`, `scoreReason`, optional `sourceTrace`
- Produces: daily report reason that mentions visual-plan suitability when relevant

- [ ] **Step 1: Write the failing test**

Create a topic card with high `viralHook`, high `contentValue`, and source trace. Assert the report reason includes:

```txt
适合转成小红书图文
```

- [ ] **Step 2: Implement minimal reason builder**

Only add this phrase when `viralHook >= 75` and `contentValue >= 75`. No separate scoring system.

- [ ] **Step 3: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/topic-daily-report.test.ts
pnpm exec eslint src/lib/topic-daily-report.ts __tests__/unit/topic-daily-report.test.ts
```

Expected: PASS.

---

## Phase 3: 小红书图文成为独立可复用资产

### Task 5: 强化 `xiaohongshu_post` 的输入契约

**Files:**
- Modify: `mingyuan/apps/web/src/lib/aim-agent-handlers.ts`
- Test: `mingyuan/apps/web/__tests__/unit/aim-content-production.test.ts`

**Interfaces:**
- Consumes: `topicTitle`, `topicRationale`, `knowledgeBlock`, `methodologyBlock`
- Produces: stable Markdown sections:
  - `# 风格判断报告`
  - `# 统一视觉母版`
  - `# 8 页图文结构`
  - `# 逐页视觉提示词（Page 01 ~ Page 08）`
  - `# 小红书发布文案`
  - `# 发布前自检`

- [ ] **Step 1: Write the failing test**

Assert the system prompt for `xiaohongshu_post` includes the 6 required section names and the canvas phrase:

```txt
1080x1440px, strict 3:4 vertical portrait canvas
```

- [ ] **Step 2: Tighten the prompt only**

Keep `buildXhsVisualDirectorInstruction()` in the same file. Do not extract a new module unless the file becomes difficult to read.

- [ ] **Step 3: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/aim-content-production.test.ts
pnpm exec eslint src/lib/aim-agent-handlers.ts __tests__/unit/aim-content-production.test.ts
```

Expected: PASS.

### Task 6: 生成结果保存时打上可复用资产标签

**Files:**
- Modify: `mingyuan/apps/web/src/app/api/aim/generate/route.ts`
- Modify: `mingyuan/apps/web/src/lib/aim-agent-handlers.ts`
- Test: `mingyuan/apps/web/__tests__/e2e/validation.test.ts` or a narrower existing AIM generate test

**Interfaces:**
- Consumes: generated `format === "xiaohongshu_post"`
- Produces: history item metadata with `assetType: "xhs_visual_plan"`

- [ ] **Step 1: Check existing history storage**

Find where AIM generation results are persisted. Do not add a second history table.

- [ ] **Step 2: Add metadata only if persistence already supports Json**

If history metadata is already Json, write `assetType`. If not, skip this task and only rely on format filtering in the sidebar.

- [ ] **Step 3: Verify**

Run the smallest existing AIM generate test. If no stable test exists, run eslint on the changed files and manually generate one `xiaohongshu_post` result in `/aim`.

---

## Phase 4: 历史侧边栏按资产形态更好复用

### Task 7: Codex 式历史分组保留，并补图文资产可见性

**Files:**
- Modify: `mingyuan/apps/web/src/components/layout/app-sidebar.tsx`
- Modify: `mingyuan/apps/web/src/lib/api/client.ts`

**Interfaces:**
- Consumes: existing `AimGeneration.agentId`, optional `format`, optional `assetType`
- Produces: nested, collapsible history groups

- [ ] **Step 1: Preserve current grouping behavior**

Before editing, verify current sidebar still has:

```txt
智能体 row -> 折叠箭头 -> 历史记录 -> 展开显示
```

- [ ] **Step 2: Add only a label/icon rule**

If an item is `xiaohongshu_post` or `xhs_visual_plan`, display it with a visual-plan label. Do not add a new sidebar section yet.

- [ ] **Step 3: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec eslint src/components/layout/app-sidebar.tsx src/lib/api/client.ts
```

Then open `/aim` and confirm old history still folds/unfolds.

---

## Phase 5: 后台素材入口向 RedBox 思路靠拢

### Task 8: 知识库素材类型补齐创作入口

**Files:**
- Modify: `mingyuan/apps/web/src/app/admin/knowledge/page.tsx`
- Modify: `mingyuan/apps/web/src/app/(dashboard)/inspiration/page.tsx`

**Interfaces:**
- Consumes: existing knowledge categories
- Produces: user-visible categories aligned to:
  - 日常灵感
  - 对标参考
  - 用户洞察
  - 老板经验
  - 产品卖点
  - 客户痛点
  - 成交案例
  - 客户问答
  - 行业热点

- [ ] **Step 1: Search existing category constants**

Run:

```bash
cd mingyuan/apps/web
rg -n "daily_inspiration|benchmark_reference|user_insight|boss_experience|product_usp|customer_pain|project_case|customer_qa|industry_hot" src
```

- [ ] **Step 2: Reuse existing constants**

Only add missing labels in the place already used by the UI. Do not create a new taxonomy file unless two or more files duplicate the same object.

- [ ] **Step 3: Verify**

Run:

```bash
cd mingyuan/apps/web
pnpm exec eslint 'src/app/(dashboard)/inspiration/page.tsx' src/app/admin/knowledge/page.tsx
```

Expected: PASS.

---

## Acceptance Checks

- `/topic-planning` still generates 4 topic cards.
- Each topic card still shows total score, verdict, five dimensions, strengths/weaknesses, and revision advice.
- Topic cards can jump into AIM with `xiaohongshu_post` selected.
- `xiaohongshu_post` output contains visual director sections and 8-page prompt structure.
- Existing “采用这个选题” and “去 AIM 写文案” flows are unchanged.
- Sidebar history remains grouped by agent and collapsible.
- No new dependency appears in `package.json`.

## Minimal Verification Command Set

```bash
cd mingyuan/apps/web
pnpm exec vitest run __tests__/unit/topic-scoring.test.ts __tests__/unit/topic-daily-report.test.ts __tests__/unit/aim-content-production.test.ts
pnpm exec eslint src/lib/topic-generation.ts src/lib/topic-validation.ts src/types/api.ts src/lib/topic-daily-report.ts src/lib/aim-agent-handlers.ts 'src/app/(dashboard)/topic-planning/page.tsx' src/components/layout/app-sidebar.tsx
git diff --check
```

## Rollout Order

1. 先做 Phase 1-2：让选题中心成为小红书图文入口。
2. 再做 Phase 3：稳定小红书图文方案输出。
3. 再做 Phase 4：优化历史资产复用。
4. 最后做 Phase 5：补素材入口分类，避免一开始就改太多后台。

## Explicitly Skipped

- 不接真实图片生成。
- 不做浏览器插件收藏器。
- 不做桌面端 RedBox 克隆。
- 不做多 Agent 审核官。
- 不改热点中心 `hot-decisions` 规则。
- 不新增数据库表。
