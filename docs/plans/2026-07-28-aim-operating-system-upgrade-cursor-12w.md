# AIM 经营系统升级执行计划（Cursor 版，12 周）

## 一、目标与执行原则

将 AIM 从生产力系统升级为可持续经营系统，打通：

```text
经营结果链：内容 → 线索 → 预约 → 成交 → 回款 → 客户结果 → 案例
组织责任链：业务 Owner → AI 执行 → 审核签字 → 系统 Owner
学习复利链：Trace → 反馈 → Eval → 方法论/Skill → 下一次改善
```

执行约束：

- Cursor 必须先读根 `AGENTS.md` 和现有 14 周正本。
- 一个工作包一个分支/worktree，同时最多 3 个 worktree。
- 保留 AIM Harness 唯一运行时，不新建 Agent 框架。
- 飞书是线索、成交、回款、客户结果正本；AIM 只保存引用、投影、Trace 和学习资产。
- 所有 Schema 变更只做加法，不删除或重解释历史数据。
- 未通过阶段门禁不得进入下一阶段或自动部署。
- 高风险外发、正式知识晋升、工作流修改必须人工批准。

技术正本交叉引用：

- `docs/plans/2026-07-24-aim-14w-upgrade-execution-plan.md`
- `docs/plans/2026-07-24-aim-agent-gap-upgrade-design.md`
- 根工作区经营总表：`明动AIM-AI原生企业升级与90天执行计划-2026-07-26.md`

## 二、Cursor 工作包

### WP-0：修复经营结果污染

分支：`fix/outcome-verdict-semantics`

实施：

- 将自由文本 `userVerdict` 拆成结构化 `verdictCode`：
  `excellent | effective | neutral | ineffective | failed`。
- 保留原文本作为 `verdictNote`，但不得参与字符串包含判断。
- 修复“无效”同时命中“有效”、任意非空判断都被视为优秀的问题。
- 7/14/30 历史数据不回填推测值；旧记录统一显示 `unknown`。
- 成交或预约只能生成“转化案例候选”；只有已审核客户结果才能生成“成功案例”。

验收：

- “无效”“失败”只生成方法论修订候选。
- `neutral` 不生成成功或失败候选。
- 旧自由文本不会被自动升级为成功结果。
- 相关单测、类型检查、Schema 契约通过。

### WP-1：任务最终处置与效率遥测

分支：`feat/run-outcome-telemetry`

扩展 `AimRunEvent` 事件契约：

```ts
type FinalDisposition =
  | "accepted_first_pass"
  | "accepted_after_edit"
  | "rewrite_requested"
  | "rejected"
  | "abandoned"

interface RunOutcomeMetadata {
  workflowId: string
  taskType: string
  finalDisposition: FinalDisposition
  humanActiveMinutes: number
  manualBaselineMinutes?: number
  reasonCode?: string
  channel: "web" | "feishu" | "api"
}
```

实施：

- 所有可审核任务最终只能有一个有效终态；事件仍 append-only，由 reducer 计算最新终态。
- 补齐 Web、飞书、Agent API 的接受、修改、重写、拒绝上报。
- 新增版本化 `TaskEfficiencyBaseline`：
  `workflowId/taskType/medianManualMinutes/sampleSize/validFrom/approvedBy`。
- Trace 统一记录 `runId/durationMs/token/costCny`。
- 后台增加直接 AI 成本与含人工时间成本两种口径。
- 历史无终态任务计入 `unknown`，不得当作拒绝或接受。

指标：

```text
节省时间 = 人工基准时间 − 实际人工投入时间
接受率 = 接受任务数 ÷ 已完成人工审核任务数
首稿接受率 = accepted_first_pass ÷ 已审核任务数
重写率 = 发生重写的任务数 ÷ 已审核任务数
成功任务直接成本 = AI成本合计 ÷ 成功任务数
完全成本 = AI成本 + 人工时间成本
```

验收：

- `runId/duration/cost` 覆盖率 ≥95%。
- 最终处置覆盖率 ≥90%。
- 重复上报幂等，不重复计算。
- 节省时间允许为负数。

### WP-2：真实审核签字与工作流责任

分支：`feat/workflow-accountability`

新增：

```ts
GovernanceAssignment {
  scopeType: "system" | "workflow"
  scopeId: string
  role: "business_owner" | "system_owner" | "reviewer" | "backup_owner"
  userId?: string
  externalOpenId?: string
  status: "active" | "inactive"
  effectiveAt: DateTime
}

ApprovalDecision {
  subjectType: "work_item" | "generation" | "asset" | "memory"
             | "methodology" | "workflow_change"
  subjectId: string
  decision: "approve" | "reject" | "request_changes"
  reviewerUserId?: string
  externalReviewerId?: string
  roleSnapshot: string
  reason: string
  source: "web" | "feishu_card" | "api"
  requestId: string
  decidedAt: DateTime
}
```

实施：

- 飞书卡片审批必须写入真实 `open_id/user_id`，删除硬编码审批结果 ID。
- 集成密钥 API 只能提交待审；`complete/publish/promote` 必须引用有效 `approvalId`。
- 每个工作流必须配置业务 Owner、备份 Owner 和审核人。
- 系统 Owner 负责稳定性、权限、成本、发布与回滚。
- 工作流或方法论变更需业务 Owner 与系统 Owner 双签。
- 管理后台写操作统一进入审计日志。

默认角色：

- 内容增长：Growth Owner。
- 销售诊断：CEO/销售 Owner。
- 咨询交付：Delivery Owner。
- 系统治理：AI System Owner。

具体人员不写死在代码中，通过治理配置页录入；未配置时 fail closed。

验收：

- 高风险动作签字率 100%。
- 审批人、时间、角色、原因可追溯。
- 审批人与事项不匹配时拒绝。
- 重放飞书卡片不会重复完成事项。

### WP-3：逐笔经营归因链

分支：`feat/business-attribution-chain`

飞书 Base 增加稳定关联字段：

```text
AIM生成ID
来源内容ID
线索记录ID
预约记录ID
成交记录ID
回款记录ID
客户结果记录ID
归因方式
归因确认人
```

AIM 新增只读投影：

```ts
OutcomeAttribution {
  generationId: string
  externalLeadId: string
  externalAppointmentId?: string
  externalDealId?: string
  externalPaymentId?: string
  attributionMethod: "explicit" | "first_touch" | "unknown"
  attributionConfidence: "high" | "medium" | "low"
  occurredAt: DateTime
}
```

实施：

- 第一版只支持明确归因和首触归因，不实现多触点模型。
- 证据不足必须记录 `unknown`，不得强行匹配。
- 同一外部线索、成交或回款 ID 幂等。
- `ContentOutcome` 保留为内容结果快照，不替代逐笔经营记录。
- 7/14/30 明确采用累计快照；周报取周期末最新快照或计算差值，禁止直接相加三个窗口。
- 所有真实飞书字段先只读核对，再固化字段契约和漂移测试。

验收：

- 30 条真实内容具有稳定 `generationId`。
- 有业务结果记录的归因覆盖率 ≥80%。
- 周报不重复计算累计快照。
- 至少完成 1 条内容→线索→预约→成交→回款链。

### WP-4：客户结果与案例证据

分支：`feat/customer-outcome-evidence`

新增 AIM 投影：

```ts
CustomerOutcomeProjection {
  projectId: string
  externalOutcomeId: string
  externalDealId?: string
  metricCode: string
  baseline?: Decimal
  target?: Decimal
  actual?: Decimal
  unit?: string
  observedFrom: DateTime
  observedTo: DateTime
  evidenceRef: string
  reviewStatus: "pending" | "approved" | "rejected"
  reviewerRef?: string
  reviewedAt?: DateTime
}
```

实施：

- 客户结果正本仍在飞书，AIM 只保存查询投影。
- 没有 baseline、actual、证据和审核人时不得标记交付成功。
- 成交只能生成转化案例候选。
- 已审核客户结果才能生成成功案例候选。
- 案例批准后进入项目级 `KnowledgeEntry.project_case`，跨项目复用仍需单独批准。

验收：

- 至少 3 条真实客户结果完成人工验收。
- 无客户结果证据时不能晋升成功案例。
- 至少 1 条案例完成候选→批准→入库→后续任务实际引用。

### WP-5：周度经营复盘与行动台账

分支：`feat/operating-review-cycle`

新增：

```ts
ReviewCycle {
  periodStart: DateTime
  periodEnd: DateTime
  status: "draft" | "signed"
  metricsSnapshot: Json
  systemOwnerId: string
  signedAt?: DateTime
}

ReviewAction {
  reviewCycleId: string
  title: string
  ownerId: string
  dueAt: DateTime
  status: "open" | "done" | "cancelled"
  evidenceRef?: string
}
```

周报固定展示：

- 发布、线索、预约、成交、回款、客户结果。
- AI 节省时间、首稿接受率、重写率、拒绝率。
- 成功任务直接成本和完全成本。
- P0/P1 失败、人工接管与高成本异常。
- 待审知识、案例、记忆、Eval、方法论候选。
- 上周行动项关闭率。
- 第 7 天结果回填率。

要求：

- 支持按项目、工作流、Owner 和渠道筛选。
- 周复盘必须形成行动项、Owner、截止日期和签字。
- 连续运行 4 周后才允许将指标接入岗位评价。
- 岗位评价看结果、质量、时效和复盘纪律，不考核 Token 数或 AI 使用次数。

### WP-6：Trace 到 Eval/方法论的学习闭环

分支：`feat/learning-candidate-loop`

新增统一候选：

```ts
LearningCandidate {
  sourceType: "trace" | "run_event" | "content_outcome"
  sourceId: string
  projectId?: string
  generationId?: string
  targetType: "eval_fixture" | "methodology_revision" | "skill_draft"
  failureCode?: string
  payload: Json
  reviewStatus: "pending" | "approved" | "rejected" | "promoted"
  reviewerId?: string
  promotedRef?: string
}
```

自动进入候选的样本：

- 所有拒绝和重写。
- 严重虚构、质量失败、工具失败。
- 高成本或异常慢任务。
- 10% 分层抽样成功任务。
- 已审核的成功或失败经营结果。

晋升流程：

```text
Trace/结果
→ LearningCandidate
→ 人工标注与批准
→ 版本化 Eval fixture
→ deterministic + daily Eval
→ MethodologyProfileVersion 草稿
→ 影子/灰度
→ 发布或回滚
```

约束：

- 候选不得自动修改正式 fixture、方法论或 Skill。
- 静态 Skill 只保留岗位铁律；可变业务方法统一进入版本化 MethodologyProfile。
- 每次运行记录使用的方法论版本、知识条目和 Skill 版本。
- 目标失败率下降且全局基线不退化才可发布。

验收：

- 至少 20 条人工标注真实样本。
- 至少跑通 1 次失败样本→Eval→方法论修订→灰度→改善。
- 目标失败类型下降 ≥20%。
- 接受率和证据完整率不得下降超过 5 个百分点。
- 严重虚构率保持 0。

### WP-7：客户分群经营分析与最终验收

分支：`feat/operating-cohort-qualification`

分群维度：

- 行业。
- 产品类型。
- 客单价区间。
- 获客渠道。
- 客户阶段。
- 问题紧迫度。

指标：

- 线索→预约率。
- 预约→成交率。
- 成交→回款率。
- 回款→客户结果达成率。
- 平均成交与交付周期。
- 平均成功任务成本。
- 案例批准率。

规则：

- 单分群样本少于 10 个时只展示数据，不输出趋势判断。
- 不使用模型预测成交概率，第一版只做描述性统计。
- 所有分群结果必须可回到具体外部记录和计算窗口。

## 三、测试与发布门禁

每个工作包必须覆盖：

1. 单元测试：状态、枚举、公式、幂等、空值和非法转换。
2. 数据库集成测试：事件→归因→周报→候选→审批。
3. 飞书契约测试：真实字段、类型、操作人和回读。
4. 权限测试：越权审批、匿名完成、重复回调、跨项目访问。
5. 学习回归：失败候选不能直写正式知识或方法论。
6. 生产门禁：

```text
目标测试
→ typecheck
→ architecture guards
→ production build
→ schema verify/migration status
→ eval:deterministic
→ eval:daily
→ 明确提交部署
→ healthz 与真实只读回读
```

灰度顺序：

```text
shadow 计算指标 2 周
→ 人工对账
→ assisted attribution
→ 单工作流试点
→ 连续 4 周达标
→ 扩大范围
```

全程禁止自动外发客户消息和未经审核的正式知识晋升。

## 四、最终“及格”门槛

连续 4 周满足：

- 三条工作流全部配置业务 Owner、审核人、备份 Owner 和系统 Owner。
- 高风险动作人工签字率 100%。
- 任务终态、成本和关联 ID 覆盖率 ≥95%。
- 第 7 天结果回填率 ≥80%。
- 周报不存在 7/14/30 重复计数。
- 10 个真实项目、30 条真实发布内容进入样本。
- 至少 3 条客户结果经人工验收。
- 至少 1 条完整经营结果链跑通。
- 至少 1 个真实失败推动 Eval 与方法论升级并证明改善。
- 正式知识、方法论、Skill 和工作流没有未经批准的写入。

## 五、默认假设

- “cuser”按 Cursor 理解。
- Cursor 首批只执行 WP-0、WP-1、WP-2；三个工作包分别审查、合并、验收后再开始 WP-3。
- 不在 AIM 内建设 Lead/Deal/Payment CRM 实体；经营正本继续留在飞书。
- 初始 Owner 不硬编码，必须通过治理配置录入；缺配置时停止自动执行。
- 历史缺失数据保留 `unknown`，不批量推断或伪造回填。
- 当前生产继续保持高风险外部副作用关闭，直到最终门槛满足。
