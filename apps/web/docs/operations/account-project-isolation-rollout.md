# 账号—项目隔离分阶段迁移、灰度、监控与回滚手册

> 适用代码：`apps/web`（AIM 主产品）。
> 目标：把「AIM 登录账号只解析一个服务端绑定项目」从代码门禁落地为**可审计、可灰度、可回滚**的生产上线过程，并让每一次模型调用与异步执行都能被 trace + 隔离指标证明属于同一个客户。
> 本手册配合 Task 1–10 已合入的实现（执行闸门、旧数据隔离、审计回填、陈旧任务隔离、管理员修复、E2E、隔离指标）使用，只描述**生产操作**，不含任何业务正文样例。

---

## 0. 术语与涉及的已实现工件（上线前请先核对）

| 工件 | 路径 / 命令 |
| --- | --- |
| 执行总闸门 / 绑定解析 | `apps/web/src/lib/account-project-context.ts`（`resolveBoundProject` / `assertAccountProjectExecutionContext` / `logAccountProjectContextRejection`） |
| trace 与上下文记录 | `apps/web/src/lib/aim-observability.ts`（`createAimTrace` / `claimAimTrace` / `runAimTraceStep`）；web 生成路径在 `apps/web/src/lib/aim/services/generate-request.ts` 记录 `resolve_project_context` step |
| 隔离指标（内容无关） | `apps/web/src/lib/account-project-isolation-metrics.ts`（`renderIsolationMetrics()` 输出 Prometheus 文本；含 `project_context_mismatch_total`、`legacy_null_scope_blocked_total`、`stale_task_quarantined_total`） |
| 五类历史业务表加列迁移 | `apps/web/prisma/migrations/20260906100000_add_project_scope_to_legacy_content`（Script / ContentGenerationRun / VideoCopyExtraction / CompetitorAnalysis / WatchAccount 增加 **nullable** `projectId`） |
| 账号绑定列迁移 | `apps/web/prisma/migrations/20260905193000_add_user_bound_project`（`User.boundProjectId` + `projectBoundAt` + `projectBindingSource` + 唯一索引） |
| 绑定候选回填 CLI（dry-run 默认） | `pnpm --dir apps/web account:binding-backfill`（脚本 `apps/web/scripts/backfill-account-project-bindings.ts`，`--apply` 需人工复核） |
| 保守审计 CLI（dry-run 默认） | `pnpm --dir apps/web account:isolation-audit`（脚本 `apps/web/scripts/audit-account-project-isolation.ts`，引擎 `apps/web/src/lib/account-project-isolation-audit.ts`；`-- --apply --report-id <id>`） |
| 管理员预览 / 修复 / 二次确认 | UI `/admin/account-project-bindings`；API `api/admin/account-project-bindings/[userId]/preview`（预览）与 `[userId]/repair`（带原因 + HMAC 确认 token 后原子执行） |
| 陈旧任务隔离原语 | `cancelStaleProjectBackgroundTask`（`apps/web/src/lib/background-tasks.ts`）、`failStaleProjectAgentInvocation`（`apps/web/src/lib/aim-remote/invocation-service.ts`），以及管理员修复中的同语义隔离逻辑 |
| 端到端门禁 | `apps/web/__tests__/e2e/account-project-isolation.e2e.test.ts`（须全绿后再进入本手册） |
| 发布门禁脚本（CI 已有） | `schema:migration-integrity` / `schema:verify` / `arch:*` / `lint` / 单测（`__tests__/unit/`） |

**硬约束（贯穿全程）**：监控指标维度只允许「入口类型 / 记录类型 + 稳定错误码」，任何指标输出不得包含客户正文、账号昵称、user id、原始消息或项目名。若发现指标里出现这类值，视为串台事件（见 §6）。

---

## 1. 三阶段上线手册

### 阶段 A —— 扩展（先加列、上闸门、写入归属）

目标：代码已经能在“加列后、回填前”的安全状态下运行；**旧的 `projectId = null` 行不会进入任何模型调用与知识召回**。

操作顺序：

1. **合入前置代码并跑发布门禁**
   - `pnpm --dir apps/web lint`
   - `pnpm --dir apps/web typecheck`
   - `pnpm --dir apps/web test`（重点：`account-project-isolation-observability.test.ts`、`account-project-execution-guard.test.ts`、`account-project-context.test.ts`、`account-project-stale-resources.test.ts`、`legacy-content-project-isolation.test.ts`、`script-structure-project-scope.test.ts`）
   - 数据库 E2E：`apps/web/__tests__/e2e/account-project-isolation.e2e.test.ts`。
2. **部署可空列迁移（纯增量，可回滚）**
   - `20260905193000_add_user_bound_project`
   - `20260906100000_add_project_scope_to_legacy_content`
   - 只加列与索引，**不删列、不回填、不改已有键**（见迁移 SQL 注释）。回滚只允许撤销这些可空列，不允许删表/整库覆盖。
3. **部署“项目归属写入”代码**（新写入全部带项目）
   - 账号自建/管理员绑定：`createInitialAccountProject` / `bindAccountProject`（写 `User.boundProjectId`）。
   - 五类历史业务表新写入必须解析出绑定项目后再写：写路径分布在 `video-copy-extractions.ts`（`requireContentProjectScope`）、`competitor-watch-video-extractions.ts`、`competitor-analysis/*`、`script-structure-store.ts`（`saveExtractedStructure` / `saveGeneratedScripts`）、`aim-generate-context.ts` 等 Task 4/5 收口后的模块。写入口带项目判定失败时**抛类型化错误**，禁止回落成 `projectId = null`。
4. **部署总闸门 + 隔离指标**
   - `assertAccountProjectExecutionContext` 已接入所有 worker 与执行路径（source = `web / remote / newsroom / inspiration / background`），模型调用与知识召回前必然先过闸门。
   - 上线后监控三支隔离指标；阶段 A 期间它们可能 > 0（正是要暴露的存量问题），**阶段 A 通过 ≠ 可放量**，需进入阶段 B 归零审计对象。
5. **阶段 A 放量判断（Gate A + Gate B 的前置观察）**
   - 观察 `project_context_mismatch_total`：按 `code` 拆分，任何入口都不应有新的 `PROJECT_CONTEXT_MISMATCH` 之外的不可解释增长；
   - 观察五类历史表新增行的 `projectId = null` 计数是否为 0（见 Gate B 查询口径）。

### 阶段 B —— 审计与回填（暂停 → dry-run → 人工 → 只应用 safe_to_backfill）

目标：把「旧 `projectId = null` 行」按**可证明的证据**归到正确项目；有歧义/冲突的行绝不自动归因，全部留给管理员；回填结束后新写入零空归属。

操作顺序：

1. **暂停相关 worker**
   - 暂停以下异步执行面，确保审计与回填期间没有并发任务把旧项目内容写回或继续执行：
     - `remote` 任务：`agent.remote.generate`（`apps/web/src/lib/aim/services/remote-invocation-task.ts`）
     - `newsroom` 任务：`apps/web/src/features/newsroom/services/newsroom-pipeline-task.ts`
     - `inspiration` 任务：`apps/web/src/features/topics/services/inspiration-background-task.ts`、`inspiration-pipeline-background-task.ts`
     - 竞品分析任务：`apps/web/src/lib/competitor-analysis/background-task.ts`
     - 通过暂停租约派发 / cron / 消费者入口实现（运维按部署方式操作，暂停期间队列积压不执行模型）。
2. **先做绑定候选回填 dry-run（可选，为闸门打底）**
   - `pnpm --dir apps/web account:binding-backfill`（dry-run）：只输出「唯一活跃项目与账号名/IP 名完全一致」的候选；其余行留在 `admin_review` / `setup` 队列，不自动绑定。
   - 如需落库：`account:binding-backfill -- --apply`（先由管理员复核输出）。
3. **执行保守审计 dry-run**
   - `pnpm --dir apps/web account:isolation-audit`
   - 产物：content-free 审计报告（`apps/web/src/lib/account-project-isolation-audit.ts`），分类含：
     - `safe_to_backfill`：有可证明引用证据（如 Script→`ContentGenerationRun.projectId`、`VideoCopyExtraction`→引用它的 Inspiration.projectId、`CompetitorAnalysis`→引用它的 BenchmarkProfile.projectId 等）且无冲突；
     - `manual_review`：证据不足（如 WatchAccount 无支持来源），**永不自动回填**；
     - `conflict`：不同引用指向不同项目，必须人工处置。
   - **校验项**：报告不含正文/昵称/消息；仅记录 id、候选 project id、证据类型与冲突原因。
4. **人工处理 conflict / manual_review**
   - 在 `/admin/account-project-bindings` 对账号执行**预览 → 填原因 → 二次确认 → 原子修复**（API：`[userId]/preview`、`[userId]/repair`）。
   - 修复过程把 `User.boundProjectId` 切换到目标项目，并在同一事务里：将停用项目恢复为 active（可选）、**隔离**该账号仍挂在旧项目下的 queued/running AgentInvocation 与 BackgroundTask（走 `cancelStaleProjectBackgroundTask` / `failStaleProjectAgentInvocation` 同语义逻辑），不触碰已完成历史。
   - 处置结果必须留下审计记录（含原因 hash、目标项目、隔离数量），不允许无原因直接改绑。
5. **只应用 safe_to_backfill**
   - 重新跑最新一次 dry-run 得到新的 report-id，然后：
     - `pnpm --dir apps/web account:isolation-audit -- --apply --report-id <id>`
   - `--apply` 只接受**当前最新报告**的 report-id（过期/不匹配报告会被拒绝），只回填 `safe_to_backfill` 行的 `projectId`；`manual_review` / `conflict` 一行都不自动应用。
6. **回填后复检（Gate B）**
   - 以 SQL 复核（只做计数，不导出正文）：
     - 五类历史表 `projectId IS NULL` 且 `createdAt` 在本轮审计/回填之后的行数 = 0；
     - 本次 `--apply` 只更新了 `safe_to_backfill` 集合（与 dry-run 报告逐条比对行数一致）。
   - 审计 CLI 可复跑做差异比对；若出现「回填后又有新的 null 行」，说明写路径仍存在回落点，先修代码，不进阶段 C。

### 阶段 C —— 灰度（恢复 worker → 内部账号 → 按 AIM 账号逐步放量）

目标：恢复异步执行并让**真实 AIM 登录账号**逐个进入隔离模式，观察期无任何项目不匹配。

操作顺序：

1. **恢复 worker**：恢复阶段 B 暂停的 remote / newsroom / inspiration / competitor 执行面（队列里若有旧项目任务，闸门会让其在租约点以 `ACCOUNT_PROJECT_CONTEXT_STALE` 失败/隔离，并计入隔离指标，见 Gate C）。
2. **内部账号灰度**：先放 2–5 个内部/测试 AIM 登录账号，跑完整生成链路（快速模式、完整模式、旧 URL 回跳、编辑室），按 §5 人工核验样本执行。
3. **按 AIM 登录账号逐步放量**：以「管理员可控、每批可逆」的方式逐批放开真实账号（在 `/admin/account-project-bindings` 确认每个账号已绑定且历史已处置）。每批结束后核对 Gates A–D。
4. **观察期**：连续观察（至少覆盖一次完整生成周期）：
   - Gate A：`project_context_mismatch_total` 中绑定不一致的模型调用 = 0；
   - Gate C：旧项目排队任务继续执行 = 0（无旧项目任务在改绑后被模型执行）；
   - Gate D：灰度账号人工核验无跨客户资料。

---

## 2. 四个发布闸门（Release Gates）

> 判定口径 = 连续观察期内满足；任一不满足即停止放量并进入 §6 回滚/止损。

- **Gate A：绑定不一致的模型调用数必须为 0。**
  监控 `project_context_mismatch_total`（维度 `entry` + `code`）。在模型调用/知识召回发生**之前**被总闸门拒绝的事件计入；观察窗口内 `code` 为项目上下文拒绝类的模型调用不得新增（`PROJECT_CONTEXT_MISMATCH` 等绑定不一致场景必须为 0）。

- **Gate B：新写入五类历史业务表的 `projectId = null` 数必须为 0。**
  五类表 = Script / ContentGenerationRun / VideoCopyExtraction / CompetitorAnalysis / WatchAccount。口径：阶段 B 回填完成后，上述表在「本轮上线之后创建」的行 `projectId IS NULL` 计数 = 0（含审计 CLI 复跑差异为 0）。

- **Gate C：旧项目排队任务继续执行数必须为 0。**
  任一账号改绑后，其旧项目下 queued/running 的 AgentInvocation 与其关联/孤儿 BackgroundTask 不得再执行模型。闸门会在租约点将其按 `ACCOUNT_PROJECT_CONTEXT_STALE` 隔离（计入 `stale_task_quarantined_total` 与 `project_context_mismatch_total`）；观察窗口内不允许出现「旧项目任务仍执行成功 / 把结果写回」的事件。

- **Gate D：灰度账号人工验证没有跨客户资料。**
  按 §5 抽查样本，逐字核对：解析出的项目、召回的素材、成稿正文的事实全部属于该客户，且正文中没有另一客户/另一项目的任何事实、昵称或消息。

---

## 3. 上线前：隔离指标核对（Task 10 Step 1 交付物）

在阶段 A 部署后、正式放量前，运维/负责人用 `renderIsolationMetrics()`（或已接入的指标出口）确认：

1. 三支指标均已出现在输出中：`project_context_mismatch_total`、`legacy_null_scope_blocked_total`、`stale_task_quarantined_total`；
2. 输出中不存在任何非固定词表的 label 取值——只有 `entry`（web/remote/newsroom/inspiration/background）、`type`（如 script_structure）、`code`（如 ACCOUNT_PROJECT_CONTEXT_STALE / PROJECT_CONTEXT_MISMATCH / BOUND_PROJECT_UNAVAILABLE / LEGACY_NULL_PROJECT_SCOPE）；
3. 用一组带正文标记的真实事件触发后，指标文本中找不到该标记（回归项由 `apps/web/__tests__/unit/account-project-isolation-observability.test.ts` 固化）。

> 说明：当前指标为进程内 Map + Prometheus 文本渲染（`apps/web/src/lib/account-project-isolation-metrics.ts`），对标仓库内 `security-metrics.ts` 的轻量模式，**不依赖 prom-client**；如需进监控大盘，可在统一指标出口（`/api/metrics`）旁挂 `renderIsolationMetrics()` 文本，由运维侧按需聚合。放量期间以进程内 reader 快照即可满足 Gates A–D 判定。

---

## 4. 生产前人工核验样本（Task 10 Step 3）

选 **≥ 2 个 AIM 登录账号，每个账号 1 个项目**。对每次生成保存以下四件套（建议导出为只读快照，不进代码仓库）：

1. **traceId**：`AimExecutionTrace.id`（由 `apps/web/src/lib/aim-observability.ts` 的 `createAimTrace` 写入）；
2. **resolved projectId**：该 trace 的 `AimExecutionTrace.projectId`（服务端 `resolveBoundProject` 解析出的绑定项目，web 路径另有 trace step `resolve_project_context` 记录 `projectId` + `binding: "account"`）；
3. **contextManifest（上下文清单）**：该 trace 的 `steps` 中与“资料召回/上下文注入”相关的 step（其 summary/metadata，例如注入的拆解上下文、样本锚点、召回材料来源），以及成稿 `AimGeneration.taskSpec` 里的 material anchors / 来源 brief；
4. **召回记录 ID**：实际进入本次上下文的 `knowledge_entry` / `video_copy_extraction` / `competitor_analysis` / `watch_account` 等记录的 id 列表（出现在 trace steps metadata 或 taskSpec 锚点中）。

人工核对口径：

- 召回记录 ID 对应的行，其 `userId + projectId` 全部等于第 2 步的 resolved project；
- 成稿正文出现的事实/数字/案例都能在该客户绑定项目的召回记录里找到，**未出现任何其他账号/项目的记录内容**；
- 对每个账号至少覆盖一次「快速模式」「完整模式/编辑室」「旧 URL 回跳」三条链路中的两条；全部通过后该账号才算 Gate D 达标。

---

## 5. 上线命令速查

```bash
# 门禁（代码）
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web test                          # 单测（含隔离观测测试）
pnpm --dir apps/web test:e2e                      # 数据库 E2E（account-project-isolation）

# 数据库
pnpm --dir apps/web db:migrate                     # 或按部署流程执行下列迁移
#   20260905193000_add_user_bound_project
#   20260906100000_add_project_scope_to_legacy_content

# 绑定候选回填（dry-run 默认）
pnpm --dir apps/web account:binding-backfill
pnpm --dir apps/web account:binding-backfill -- --apply     # 管理员复核后

# 保守审计回填（dry-run 默认）
pnpm --dir apps/web account:isolation-audit
pnpm --dir apps/web account:isolation-audit -- --apply --report-id <id>
```

> 迁移命令以部署环境实际可用入口为准；任何迁移前先做数据库备份并核对备份可恢复。

---

## 6. 回滚与止损策略（Task 10 Step 4，**精确口径**）

### 6.1 应用异常

- 暂停 remote / newsroom / inspiration（含竞品分析）worker，停止异步渠道执行；
- 把应用回滚到**前一 SHA**；
- 数据列不动（见 6.2），回滚只回代码。

### 6.2 数据迁移异常

- **不删除**本次新增的 nullable 列（`User.boundProjectId` 与五类表的 `projectId` 及索引），保证代码两侧均可运行、审计证据不被破坏；
- **停止**一切审计/回填 `--apply`；
- 依据最新审计报告**反向恢复**本次已更新的 `projectId`（只把本次 `--apply` 改过的行还原为 `null`，按 report 中的记录 id 反向操作），不触碰任何历史审计分类与人工处置记录。

### 6.3 任何串台证据（最高优先级）

出现下列任一情况：

- 灰度样本中发现跨客户资料/正文事实不属于绑定项目；
- 指标输出或日志出现客户正文、账号昵称、原始消息（内容泄漏）；
- 有用户读取到了其它项目的 `existingGenerationId` / 视频文案 / 竞品 / 监控账号 / 脚本 / 任务卡内容。

立即执行：

1. **停止所有模型生成**与**所有异步渠道执行**（remote/newsroom/inspiration/competitor/background）；
2. **保留 trace 与审计记录**（只读，禁止清理、覆盖或删除，用于定位与举证）；
3. **禁止继续灰度**，进入串台事件复盘；未查明并修复前不恢复任何入口。

### 6.4 通用禁令

- **禁止** `git reset --hard` 处理普通回滚；
- **禁止**以「整库覆盖」/「从备份整库还原」方式做常规回滚；
- 回滚期间所有操作走管理员修复流（预览 + 原因 + 二次确认 + 审计记录），不直接改库、不改绑定。

---

## 7. 完成定义对照（何时可宣布“修复完成”）

同时满足才视为完成：

1. 代码门禁已合入（lint / typecheck / 单测 / E2E / 迁移完整性 / 架构门禁全绿）；
2. 历史数据审计完成，且 `conflict` / `manual_review` 均有处置与审计记录；
3. AIM 登录账号灰度通过（≥2 账号 × 1 项目人工核验无串台）；
4. 连续观察期内：无项目不匹配的模型调用（Gate A）、无新空项目业务数据（Gate B）、无旧项目任务继续执行（Gate C）、无跨客户资料（Gate D）。

只通过 mock 单测、只完成数据库加列或只让页面显示正确，**都不视为完成**——必须由 trace 证明“解析项目、召回资料、成稿事实属于同一客户”。
