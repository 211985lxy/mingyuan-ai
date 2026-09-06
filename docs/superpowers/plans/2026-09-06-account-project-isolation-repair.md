# AIM 账号项目隔离与串台修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底消除“登录 AIM 账号后生成了其他客户内容”的串台风险，并建立稳定的业务模型：一个 AIM 登录账号固定绑定一个客户项目，所有生成、知识召回、历史素材和后台执行都只能使用该绑定项目。

**Architecture:** 把 `User.boundProjectId` 作为所有在线请求和后台执行的唯一项目真源。任何模型调用、知识召回、历史素材读取和异步任务执行前，都必须再次验证 `userId + projectId` 与当前绑定一致。历史账号级数据新增 `projectId` 并采用“可证明才迁移、无法证明就隔离”的策略。

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, React, 现有 BackgroundTask/AgentInvocation、AdminAuditLog 和 AIM trace 体系。

## Global Constraints

- 本计划中的“账号”只指 AIM 软件登录账号 `User`。
- 一个 AIM 登录账号只能绑定一个 active 客户项目；普通用户不能切换项目。
- 抖音号、微信视频号、多平台账号、渠道路由、外部账号会话和矩阵去重均不属于本轮范围；不得新增、迁移或调整这些能力。
- 已存在的渠道或远程任务若会触发 AIM 生成，只增加同一套账号项目安全校验，不改变其账号模型、路由或产品行为。
- 所有进入大模型的客户专属资料必须满足 `row.userId === userId && row.projectId === User.boundProjectId`。
- 历史 `projectId = null` 或归属冲突的数据不得进入生成上下文；只有存在唯一、可审计证据时才允许回填。
- 不自动复活已暂停/归档项目；管理员修复绑定必须显式选择、填写原因并留下审计记录。
- 不读取、修改或打印 `.env`、数据库备份、激活码和生产凭证；生产迁移与部署必须另行获得明确授权。
- 当前分支已有大量未提交改动。实施时每个任务只提交本任务文件，禁止 `git add .`，禁止覆盖其他人的并发改动。
- 每个任务先增加能稳定复现问题的失败测试，再做最小实现；每次提交前运行聚焦测试和 `git diff --check`。

---

## 业务不变量

| 对象 | 正确归属 | 允许关系 | 禁止行为 |
| --- | --- | --- | --- |
| AIM 登录账号 `User` | `boundProjectId` | 1 个账号固定 1 个项目 | 用户自行切换项目 |
| 客户项目 `ClientProject` | `userId` | 由所属 AIM 账号使用 | 使用其他用户的项目 |
| 知识库/IP 档案 | `userId + projectId` | 绑定项目内共享 | 跨项目召回 |
| 历史素材/竞品/脚本 | `userId + projectId` | 项目内复用 | 仅按 `userId` 注入模型 |
| 后台任务 | 创建时快照，执行时重验当前绑定 | 当前绑定仍一致才执行 | 旧绑定任务继续消耗模型并写入旧项目 |

## 合并后的问题清单

| 问题现象 | 本质原因 | 优化建议 | 优先级 |
| --- | --- | --- | --- |
| 生成内容带出其他客户的竞品、视频文案或脚本 | `CompetitorAnalysis`、`WatchAccount`、`VideoCopyExtraction`、`ContentGenerationRun`、`Script` 仍是账号级数据，部分查询只有 `userId` | 增加 `projectId`；所有读写改为双重作用域；历史空归属数据隔离 | 高 |
| 引用一个旧作品继续改写时，可能把其他项目的任务卡注入模型 | `existingGenerationId` 查询只校验 `id + userId` | 查询增加当前 `projectId`，不匹配时在模型调用前明确拒绝 | 高 |
| 已绑定过旧项目的远程调用或后台任务仍可能继续执行 | 异步执行信任创建时保存的 `projectId`，没有重验当前 `User.boundProjectId` | 所有 worker 入口统一执行绑定校验；旧任务进入隔离队列 | 高 |
| 账号只有暂停/归档项目时，既不能绑定也不能新建 | 状态判断统计全部项目，但绑定只接受 active 项目 | 增加“停用项目待恢复”状态；管理员显式恢复并绑定，或新建并绑定 | 中 |
| 管理页提示可处理错误绑定，但后端禁止替换 | 缺少受控、可审计的管理员修复流程 | 增加预检、确认、原因、资源处置和审计闭环；普通用户仍不可切换 | 中 |
| 拒绝请求的 trace 先记录了客户端传入的错误项目 | trace 在项目绑定校验前创建 | 先解析并解析绑定，再创建正式 trace；拒绝请求单独记安全审计 | 中 |
| URL 残留旧 `projectId` 后工作台空白 | 前端发现旧参数后返回空值，没有回到唯一绑定项目 | 忽略旧参数并替换为服务端返回的绑定项目 | 中 |
| 文件附件模块只有导入没有真实调用 | 前期恢复代码未完成接线，形成死代码 | 本轮删除未使用入口和类型；附件功能另立需求 | 低 |

## 为什么按这个顺序修

1. **先加执行前总闸门**：最快阻止旧任务和伪造项目继续调用模型，是立即降低串台面的措施。
2. **再修读取与引用链**：即使新绑定正确，只按 `userId` 读历史数据仍会污染正文。
3. **再迁移历史数据**：先让代码能识别并拒绝无项目数据，再做保守回填，避免迁移期间继续扩大污染。
4. **最后补管理恢复、前端体验和灰度**：这些不应阻挡安全闸门上线，但必须在正式交付前闭环。

---

### Task 1: 建立账号绑定执行总闸门

**Files:**
- Modify: `apps/web/src/lib/account-project-context.ts`
- Modify: `apps/web/src/lib/aim/services/remote-invocation-task.ts`
- Modify: `apps/web/src/features/newsroom/services/newsroom-pipeline-task.ts`
- Modify: `apps/web/src/features/topics/services/inspiration-background-task.ts`
- Modify: `apps/web/src/features/topics/services/inspiration-pipeline-background-task.ts`
- Test: `apps/web/__tests__/unit/account-project-execution-guard.test.ts`

**Interfaces:**

```ts
export async function assertAccountProjectExecutionContext(input: {
  userId: string
  projectId: string
  source: "web" | "remote" | "newsroom" | "inspiration" | "background"
}): Promise<BoundProject>
```

该函数内部复用 `resolveBoundProject`，不能复制一套略有差异的绑定规则。

- [ ] **Step 1: 写失败测试覆盖在线与异步入口**

覆盖四类结果：当前绑定一致时通过；项目不一致时返回 `PROJECT_CONTEXT_MISMATCH`；绑定项目停用时返回 `BOUND_PROJECT_UNAVAILABLE`；worker 在拒绝后不调用 `executeAimRun`、不消费模型额度、不把任务标记为成功。

- [ ] **Step 2: 运行测试并确认因缺少统一闸门而失败**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-execution-guard.test.ts`

Expected: FAIL，至少一个异步入口在没有重新读取 `User.boundProjectId` 的情况下继续执行。

- [ ] **Step 3: 实现统一闸门并接入所有 worker**

在领取任务、读取任务归属后，任何模型调用和业务写入前调用总闸门。失败时：

- 当前任务标记为 `failed` 或 `quarantined`，错误码使用稳定值 `ACCOUNT_PROJECT_CONTEXT_STALE`；
- 不重试不可恢复的项目不匹配；
- 日志只记录 `userId`、任务 ID、期望/实际项目 ID，不记录客户正文或知识内容；
- 对外调用返回通用提示“账号项目配置已变化，请联系管理员”，不泄露项目名称。

- [ ] **Step 4: 验证总闸门测试并提交**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-execution-guard.test.ts`

Expected: PASS，所有不匹配分支的模型执行 mock 调用次数均为 0。

Commit: `fix(isolation): revalidate account project before execution`

---

### Task 2: 修复生成入口的跨项目引用与 trace 归属

**Files:**
- Modify: `apps/web/src/lib/aim/services/generate-request.ts`
- Modify: `apps/web/src/lib/aim-observability.ts`
- Test: `apps/web/__tests__/unit/aim-generate-cross-project-isolation.test.ts`
- Test: `apps/web/__tests__/unit/aim-generate-route.test.ts`

**Interfaces:**

- `existingGenerationId` 只允许读取 `id + userId + resolvedProjectId` 完全一致的记录。
- 正式 `AimExecutionTrace.projectId` 只能使用服务端解析后的绑定项目。
- 绑定校验失败的请求记录为拒绝审计事件，不创建挂在伪造项目下的生成 trace。

- [ ] **Step 1: 写两个回归测试**

测试 A：用户绑定 `project-a`，传入同一用户 `project-b` 的 `existingGenerationId`，返回 404/409，`taskSpec` 不进入执行参数，模型不被调用。

测试 B：请求体传 `project-b`，账号绑定 `project-a`，拒绝日志不得以 `project-b` 创建正式 trace。

- [ ] **Step 2: 运行并确认当前实现失败**

Run: `pnpm --dir apps/web test -- __tests__/unit/aim-generate-cross-project-isolation.test.ts __tests__/unit/aim-generate-route.test.ts`

Expected: FAIL，当前 `AimGeneration` 查询缺少项目条件，trace 早于项目解析创建。

- [ ] **Step 3: 先解析绑定，再创建正式 trace**

调整顺序为：解析请求 → 基础字段校验 → `resolveBoundProject` → 创建绑定项目 trace → 继续上下文组装。若项目校验失败，使用已有管理审计/安全日志记录拒绝，不把不可信项目 ID 作为外键归属。

- [ ] **Step 4: 给已有作品查询增加项目条件**

使用：

```ts
where: { id: parsed.existingGenerationId, userId, projectId }
```

指定了 `existingGenerationId` 但查不到时必须立即返回稳定错误 `EXISTING_GENERATION_NOT_IN_BOUND_PROJECT`，不能静默当成没有旧稿继续生成。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --dir apps/web test -- __tests__/unit/aim-generate-cross-project-isolation.test.ts __tests__/unit/aim-generate-route.test.ts __tests__/unit/aim-trace-sse-security.test.ts`

Expected: PASS。

Commit: `fix(aim): scope generation references to bound project`

---

### Task 3: 为历史账号级业务数据增加项目归属

**Files:**
- Modify: `apps/web/prisma/competitor.prisma`
- Modify: `apps/web/prisma/content.prisma`
- Modify: `apps/web/prisma/profiles.prisma`
- Create: `apps/web/prisma/migrations/20260906100000_add_project_scope_to_legacy_content/migration.sql`
- Modify: `apps/web/prisma/production-schema-contract.json`
- Modify: `apps/web/scripts/apply-production-schema-patches.mjs`
- Test: `apps/web/__tests__/unit/production-schema-patches.test.ts`
- Test: `apps/web/__tests__/unit/legacy-content-project-schema.test.ts`

**Schema changes:**

- `CompetitorAnalysis.projectId String?`
- `WatchAccount.projectId String?`
- `VideoCopyExtraction.projectId String?`
- `ContentGenerationRun.projectId String?`
- `Script.projectId String?`
- 对应 `ClientProject` 关系和 `[userId, projectId, ...]` 索引。

第一阶段全部使用 nullable，是为了兼容历史记录；应用层的新写入必须非空。不得仅因为某个用户今天绑定了一个项目，就把全部历史数据自动归到该项目。

- [ ] **Step 1: 写 schema 契约失败测试**

测试要求五个模型都存在 `projectId`、项目关系和联合索引，并要求生产 schema 契约包含相同列。

- [ ] **Step 2: 运行测试并确认缺列**

Run: `pnpm --dir apps/web test -- __tests__/unit/legacy-content-project-schema.test.ts __tests__/unit/production-schema-patches.test.ts`

Expected: FAIL，报告五个模型缺少项目列或索引。

- [ ] **Step 3: 添加纯扩展迁移**

迁移只新增 nullable 列、普通索引和外键，不删除旧列、不更新历史行、不改变现有唯一键。外键采用与现有项目业务表一致的删除策略；如果项目删除会破坏审计证据，则使用 `SetNull`。

- [ ] **Step 4: 更新 Prisma 关系和生产 schema 校验**

补齐 `ClientProject` 反向关系、生成客户端所需 schema，以及生产补丁/契约检查。不要手工编辑生成客户端文件。

- [ ] **Step 5: 验证 schema 并提交**

Run:

```bash
pnpm --dir apps/web exec prisma format --schema prisma/schema.prisma
pnpm --dir apps/web exec prisma validate --schema prisma/schema.prisma
pnpm --dir apps/web exec prisma generate --schema prisma/schema.prisma
pnpm --dir apps/web schema:migration-integrity
pnpm --dir apps/web test -- __tests__/unit/legacy-content-project-schema.test.ts __tests__/unit/production-schema-patches.test.ts
```

Expected: Prisma schema valid，迁移完整性和聚焦测试 PASS。

Commit: `feat(data): add project scope to legacy content records`

---

### Task 4: 把历史素材读写全部收紧到绑定项目

**Files:**
- Modify: `apps/web/src/lib/aim-generate-context.ts`
- Modify: `apps/web/src/lib/aim-competitor-watch-context.ts`
- Modify: `apps/web/src/lib/hot-briefing-watch-context.ts`
- Modify: `apps/web/src/lib/content-pipeline/competitor-bridge.ts`
- Modify: `apps/web/src/lib/competitor-watch-video-extractions.ts`
- Modify: `apps/web/src/lib/video-copy-extractions.ts`
- Modify: `apps/web/src/lib/aim/services/chat/context-loaders.ts`
- Modify: `apps/web/src/app/api/topics/generate/route.ts`
- Modify: `apps/web/src/app/api/scripts/generate/route.ts`
- Modify: `apps/web/src/lib/aim/script-structure-store.ts`
- Modify: `apps/web/src/app/api/competitor/analyze/route.ts`
- Modify: `apps/web/src/app/api/competitor/watch-accounts/route.ts`
- Modify: `apps/web/src/app/api/competitor/watch-accounts/[id]/route.ts`
- Modify: `apps/web/src/app/api/competitor/watch-accounts/refresh/route.ts`
- Modify: `apps/web/src/app/api/video-copy-extractions/route.ts`
- Modify: `apps/web/src/app/api/competitor/reports/route.ts`
- Modify: `apps/web/src/app/api/competitor/[id]/route.ts`
- Test: `apps/web/__tests__/unit/legacy-content-project-isolation.test.ts`
- Test: `apps/web/__tests__/unit/aim-context-project-isolation.test.ts`

**Rule:** 所有新建记录写入解析后的 `projectId`；所有列表、详情、更新、删除、上下文拼接查询都使用 `userId + projectId`。禁止 `projectId: null` 进入模型上下文。

- [ ] **Step 1: 建立查询清单并写失败测试**

测试分别放入同一用户的 `project-a`、`project-b` 和 `null` 记录，确认只返回绑定项目记录。至少覆盖视频文案、监控账号、竞品分析、脚本生成运行和脚本五类数据。

- [ ] **Step 2: 运行聚焦测试确认当前查询会串台**

Run: `pnpm --dir apps/web test -- __tests__/unit/legacy-content-project-isolation.test.ts __tests__/unit/aim-context-project-isolation.test.ts`

Expected: FAIL，mock 断言显示查询只有 `userId` 或详情查询没有项目条件。

- [ ] **Step 3: 修改生成上下文和聊天上下文**

给 `buildVideoCopyContext`、监控账号、竞品分析和聊天 context loader 显式传入 `projectId`。不要在底层函数缺项目时回退到用户级数据；缺少项目应返回空上下文或抛出调用方可识别的配置错误。

- [ ] **Step 4: 修改所有创建、列表、详情和更新接口**

入口先调用 `resolveBoundProject`，再把项目写入数据。详情和修改接口使用 `findFirst/updateMany` 的 `id + userId + projectId` 条件，避免先查后改间隙。

- [ ] **Step 5: 修复后台竞品和视频提取链**

`CompetitorAnalysis` 与 `VideoCopyExtraction` 的后台任务领取后，也要通过记录的 `projectId` 调用 Task 1 总闸门。历史空项目任务标记为隔离，不继续处理。

- [ ] **Step 6: 验证并提交**

Run:

```bash
pnpm --dir apps/web test -- __tests__/unit/legacy-content-project-isolation.test.ts __tests__/unit/aim-context-project-isolation.test.ts __tests__/unit/competitor-analysis __tests__/unit/aim-generate-route.test.ts
pnpm --dir apps/web db:bounds
```

Expected: 聚焦测试 PASS；查询边界检查不新增无界查询。

Commit: `fix(data): enforce project scope on legacy content access`

---

### Task 5: 建立保守的历史数据审计与回填流程

**Files:**
- Create: `apps/web/src/lib/account-project-isolation-audit.ts`
- Create: `apps/web/scripts/audit-account-project-isolation.ts`
- Modify: `apps/web/package.json`
- Test: `apps/web/__tests__/unit/account-project-isolation-audit.test.ts`

**CLI contract:**

```bash
pnpm --dir apps/web account:isolation-audit
pnpm --dir apps/web account:isolation-audit -- --apply --report-id <id>
```

默认只能 dry-run；`--apply` 必须引用本次生成、尚未过期且零冲突的报告 ID。

**唯一允许自动回填的证据：**

- `Script` 的 `generationRun.projectId`；
- `ContentGenerationRun` 的 `ipProfile.projectId`，以及存在时与其一致的 `topicSelection.projectId`；两者冲突时禁止自动回填；
- `VideoCopyExtraction` 被同一项目的 `Inspiration` 唯一引用；
- `CompetitorAnalysis` 被同一项目的 `BenchmarkProfile` 唯一引用；
- 其他来源只有在所有可验证引用都指向同一项目时才可回填。

`User.boundProjectId`、项目数量为 1、名称相似或最近使用时间都不能单独作为自动回填证据。

- [ ] **Step 1: 写分类测试**

测试输出三类：`safe_to_backfill`、`manual_review`、`conflict`。多项目引用必须为 `conflict`；无引用必须为 `manual_review`。

- [ ] **Step 2: 运行并确认脚本缺失**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-isolation-audit.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现只读审计报告**

报告只输出计数、记录 ID、候选项目 ID、证据类型和冲突原因，不输出文案正文、聊天内容或知识库原文。报告应统计：空项目历史记录、跨项目引用、排队中的 BackgroundTask/AgentInvocation。

- [ ] **Step 4: 实现带报告锁的应用模式**

事务中重新验证证据；只更新 `safe_to_backfill`。任何数据在报告后发生变化都跳过并记录，不扩大更新范围。`manual_review` 和 `conflict` 保持 `projectId = null`，在线生成已由 Task 4 排除。

- [ ] **Step 5: 验证 dry-run 无写入并提交**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-isolation-audit.test.ts`

Expected: PASS，dry-run 的 update mock 调用次数为 0。

Commit: `feat(admin): add conservative project isolation audit`

---

### Task 6: 隔离旧项目的排队任务

**Files:**
- Modify: `apps/web/src/lib/account-project-isolation-audit.ts`
- Modify: `apps/web/scripts/audit-account-project-isolation.ts`
- Modify: `apps/web/src/lib/aim-remote/invocation-service.ts`
- Modify: `apps/web/src/lib/background-tasks.ts`
- Test: `apps/web/__tests__/unit/account-project-stale-resources.test.ts`

**Policy:** 绑定变化后，旧项目任务不得被静默搬到新项目。

- `AgentInvocation`：标记 `failed`，错误码为 `ACCOUNT_PROJECT_CONTEXT_STALE`；
- `BackgroundTask`：使用现有 `cancelled` 状态，`lastError` 写入稳定原因 `ACCOUNT_PROJECT_CONTEXT_STALE`；
- 已开始但尚未调用模型的任务由总闸门中止；
- 已完成历史记录保留原项目，禁止改写归属。

- [ ] **Step 1: 写旧资源处置失败测试**

构造用户由 `project-a` 修复绑定到 `project-b` 后的资源，断言旧任务不能领取或继续执行，而已完成历史记录仍可供管理员审计。

- [ ] **Step 2: 运行并确认旧资源仍可执行**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-stale-resources.test.ts`

Expected: FAIL。

- [ ] **Step 3: 在审计应用模式中实现资源隔离**

每一类更新独立统计，写入审计日志；如果其中一类失败，事务回滚，不允许出现“绑定已改、旧任务仍 active”的半状态。

- [ ] **Step 4: 在新任务创建时保存绑定快照**

所有 Invocation 和 BackgroundTask 创建路径必须从当前绑定解析项目，不能接受客户端任意 `projectId`。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-stale-resources.test.ts __tests__/unit/account-project-execution-guard.test.ts`

Expected: PASS。

Commit: `fix(tasks): quarantine stale project resources`

---

### Task 7: 增加管理员可审计的绑定修复与停用项目恢复

**Files:**
- Modify: `apps/web/src/lib/account-project-context.ts`
- Modify: `apps/web/src/app/api/admin/account-project-bindings/route.ts`
- Create: `apps/web/src/app/api/admin/account-project-bindings/[userId]/preview/route.ts`
- Create: `apps/web/src/app/api/admin/account-project-bindings/[userId]/repair/route.ts`
- Modify: `apps/web/src/app/admin/account-project-bindings/page.tsx`
- Modify: `apps/web/src/lib/api/admin-client.ts`
- Test: `apps/web/__tests__/unit/account-project-admin-repair.test.ts`
- Test: `apps/web/__tests__/unit/account-project-context.test.ts`

**New status:**

```ts
type AccountProjectContextStatus =
  | "bound"
  | "setup_required"
  | "admin_review_required"
  | "inactive_project_recovery_required"
```

**Repair flow:** 预览影响 → 管理员输入原因 → 二次确认 token → 原子执行恢复/改绑和旧资源隔离 → `AdminAuditLog`。

- [ ] **Step 1: 写 inactive-only 和改绑失败测试**

账号只有 archived/paused 项目时不能进入死循环；普通用户仍无切换接口；管理员没有原因、没有预览 token、项目不属于用户或目标不是 active 时均拒绝。

- [ ] **Step 2: 运行并确认现有状态机和后端不支持修复**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-admin-repair.test.ts __tests__/unit/account-project-context.test.ts`

Expected: FAIL。

- [ ] **Step 3: 修复账号状态判断**

分别统计 active 和 inactive 项目。无项目为 `setup_required`；有 active 未绑定为 `admin_review_required`；只有 inactive 为 `inactive_project_recovery_required`。创建首个项目时也使用相同判定，避免统计口径分裂。

- [ ] **Step 4: 实现管理员预览接口**

返回当前/目标项目、知识与内容计数、将被取消的任务数、无法自动归属的历史记录数。不得返回正文内容。

- [ ] **Step 5: 实现原子修复接口**

事务内锁定/条件更新用户绑定，调用 Task 6 任务隔离，按管理员明确选择决定是否把 inactive 目标恢复为 active，并记录 `previousProjectId`、`nextProjectId`、reason、影响计数和 requestId。普通 `bindAccountProject` 继续禁止替换；修复使用独立函数，避免扩大普通接口权限。

- [ ] **Step 6: 更新管理页**

清楚区分“首次绑定”“恢复停用项目”“修复错误绑定”。确认按钮展示影响摘要，禁止单击直接替换。不要给普通项目页增加切换器。

- [ ] **Step 7: 验证并提交**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-admin-repair.test.ts __tests__/unit/account-project-context.test.ts __tests__/unit/account-project-admin-route.test.ts`

Expected: PASS，审计 mock 包含修改前后项目和原因。

Commit: `feat(admin): add audited account project repair`

---

### Task 8: 修复工作台旧 URL 并清理本轮死代码

**Files:**
- Modify: `apps/web/src/hooks/use-aim-project-workspace.ts`
- Modify: `apps/web/__tests__/unit/aim-project-workspace.test.ts`
- Modify: `apps/web/src/app/(dashboard)/aim/page.tsx`
- Modify: `apps/web/src/lib/aim/workbench-types.ts`
- Delete: `apps/web/src/lib/aim/file-attachments.ts`

**Behavior:** 服务端只返回一个绑定项目时，旧 URL 中的其他项目 ID 被忽略并替换为绑定项目；快速模式和完整模式一致。未真正接线的文件附件代码不留在本轮修复中。

- [ ] **Step 1: 写旧 URL 回归测试**

`selectAuthorizedProjectId("stale-project", [{ id: "bound-project" }])` 应返回 `bound-project`。页面刷新后历史列表只请求绑定项目。

- [ ] **Step 2: 运行并确认当前返回空字符串**

Run: `pnpm --dir apps/web test -- __tests__/unit/aim-project-workspace.test.ts`

Expected: FAIL。

- [ ] **Step 3: 使用绑定项目覆盖旧参数**

选择函数始终以服务端返回的唯一项目为准；如页面保存 `projectId` 查询参数，使用 `replace` 规范化 URL，不能触发第二次生成请求。

- [ ] **Step 4: 删除无调用的附件入口**

先运行 `rg -n "appendAimFileAttachmentsToContent|AimFileAttachment|file-attachments" apps/web/src apps/web/__tests__`，仅当确认没有真实调用后删除未使用 import、模块和本轮新增类型。不要顺带重构 AIM 页面。

- [ ] **Step 5: 验证并提交**

Run:

```bash
pnpm --dir apps/web test -- __tests__/unit/aim-project-workspace.test.ts
pnpm --dir apps/web typecheck
```

Expected: PASS，无未使用 import 或类型错误。

Commit: `fix(ui): canonicalize bound project workspace`

---

### Task 9: 建立数据库级隔离验收和全链路回归

**Files:**
- Create: `apps/web/__tests__/e2e/account-project-isolation.e2e.test.ts`
- Modify: `apps/web/scripts/e2e-database.ts`
- Modify: `apps/web/__tests__/unit/resource-ownership.test.ts`

**Test fixtures:** 两个 AIM 用户、每人一个绑定项目；用户 A 额外有一个旧项目和 `projectId = null` 历史记录。测试数据库必须是隔离库，禁止指向生产。

- [ ] **Step 1: 写数据库级失败场景**

至少覆盖：

1. 用户 A 请求旧项目被拒绝；
2. 用户 A 引用旧项目 Generation 被拒绝且无模型调用；
3. 用户 A 生成上下文不含旧项目和 null 历史；
4. 旧 AgentInvocation/BackgroundTask 在执行时被隔离；
5. inactive-only 账号进入恢复状态；
6. 管理员修复后旧任务取消、审计完整。

- [ ] **Step 2: 准备隔离数据库并运行 E2E**

Run:

```bash
pnpm --dir apps/web test:e2e:prepare
pnpm --dir apps/web test:e2e -- __tests__/e2e/account-project-isolation.e2e.test.ts
```

Expected: 初次 FAIL，实施 Task 1-8 后 PASS。

- [ ] **Step 3: 运行完整静态和测试门禁**

Run:

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web typecheck:tests
pnpm --dir apps/web test:unit
pnpm --dir apps/web test:component -- --reporter=dot
pnpm --dir apps/web lint
pnpm --dir apps/web db:bounds
pnpm --dir apps/web api:contracts
pnpm --dir apps/web schema:migration-integrity
pnpm --dir apps/web schema:verify
pnpm --dir apps/web build
git diff --check
```

Expected: 全部退出码 0。若仓库已有与本任务无关的基线失败，必须保存执行命令、完整错误和对比证据，不得把失败称为通过。

- [ ] **Step 4: 提交验收测试**

Commit: `test(isolation): cover account project boundaries end to end`

---

### Task 10: 分阶段迁移、灰度、监控和回滚

**Files:**
- Create: `apps/web/docs/operations/account-project-isolation-rollout.md`
- Modify: `apps/web/src/lib/aim-observability.ts`
- Test: `apps/web/__tests__/unit/account-project-isolation-observability.test.ts`

**Release gates:**

- Gate A：绑定不一致的模型调用数必须为 0；
- Gate B：新写入五类历史业务表的 `projectId = null` 数必须为 0；
- Gate C：旧项目排队任务继续执行数必须为 0；
- Gate D：灰度账号人工验证没有跨客户资料。

- [ ] **Step 1: 增加不含正文的隔离指标**

指标至少包括 `project_context_mismatch_total`、`legacy_null_scope_blocked_total`、`stale_task_quarantined_total`。维度只允许入口类型和错误码，不允许客户内容、账号昵称或原始消息。

- [ ] **Step 2: 编写三阶段上线手册**

阶段 A（扩展）：部署 nullable 项目列、执行总闸门和项目归属写入代码。

阶段 B（审计与回填）：暂停相关 worker，执行 dry-run；人工处理冲突；只应用 `safe_to_backfill`；确认新写入零空归属。

阶段 C（灰度）：恢复 worker，从内部测试账号开始，按 AIM 登录账号逐步放量。

- [ ] **Step 3: 明确生产前人工核验样本**

选择至少 2 个 AIM 登录账号、每个账号 1 个项目。对每次生成保存 `traceId`、resolved `projectId`、`contextManifest` 和召回记录 ID，人工检查正文只出现该客户事实。

- [ ] **Step 4: 明确回滚策略**

- 应用异常：暂停远程/newsroom/inspiration worker，回滚应用到前一 SHA；
- 数据迁移异常：不删除新增 nullable 列，停止应用回填，依据审计报告反向恢复本次更新的 `projectId`；
- 任意串台证据：立即停止所有模型生成和异步渠道执行，保留 trace 与审计记录，禁止继续灰度。

禁止用 `git reset --hard`、禁止恢复生产数据库整库覆盖来处理普通回滚。

- [ ] **Step 5: 运行观测测试并完成发布前评审**

Run: `pnpm --dir apps/web test -- __tests__/unit/account-project-isolation-observability.test.ts`

Expected: PASS，指标不包含原始内容字段。

Commit: `docs(ops): add account isolation rollout runbook`

---

## 最终验收清单

- [ ] 登录账号在所有 Web/API/Agent/渠道入口只解析出一个服务端绑定项目。
- [ ] 任何项目不匹配都发生在模型调用和知识召回之前。
- [ ] 五类历史账号级数据的新记录全部带项目，旧空项目记录不会进入生成。
- [ ] `existingGenerationId`、视频文案、竞品、监控账号、脚本和任务卡均无法跨项目读取。
- [ ] 旧项目的 AgentInvocation 和 BackgroundTask 不会因改绑继续执行。
- [ ] inactive-only 账号有明确恢复路径，不再卡死。
- [ ] 普通用户没有项目切换能力；管理员修复有预览、原因、二次确认和审计记录。
- [ ] 快速模式、完整模式和旧 URL 都自动回到绑定项目。
- [ ] 单元、组件、数据库 E2E、类型、Lint、Schema、Build 和迁移完整性门禁全部通过。
- [ ] 生产灰度样本能从 trace 证明：解析项目、召回资料、成稿事实均属于同一客户。

## 完成定义

只有同时满足以下条件才能称为“修复完成”：代码门禁已合并；历史数据审计完成且冲突有处置记录；AIM 登录账号灰度通过；连续观察期内无项目不匹配模型调用、无新空项目业务数据、无旧项目任务继续执行。只通过 mock 单测、只完成数据库加列或只让页面显示正确，都不能视为完成。
