# AIM 智能体系统 14 周升级执行计划（正本）

> 状态：**执行正本**（已拍板）  
> 日期：2026-07-24  
> 设计依据：[`2026-07-24-aim-agent-gap-upgrade-design.md`](./2026-07-24-aim-agent-gap-upgrade-design.md)  
> 本文件关闭设计稿 §8 待拍板项，并按「内容增长为主战场、销售为第二试点」排期。  
> 约束：ADR-001 — 唯一 AIM Harness；禁止第二套 Agent Runtime。

---

## 一、目标与成功标准

在不引入第二套 Agent Runtime 的前提下，将现有 AIM Harness 升级为「可评估、有界自主、可回退、可持续学习」的生产级系统。本季度以内容增长为主战场，同时验证销售补证能力。

完成标准：

- 所有入口仍统一经过 `executeAimRun` / `streamAimRun`。
- PR 必跑确定性评估；主干和候选发布必跑真实模型 daily eval。
- 内容选题核验、销售诊断补证支持只读 Bounded Tool Loop。
- Tool Loop 具备步数、时间、Token、工具白名单和人工接管限制。
- 内容管道至少完成 30 个真实影子样本、连续运行 5 个工作日，再逐级开放。
- 关键契约通过率 100%，严重虚构事实为 0；质量指标相对现有基线不得下降超过 5%。
- 新记忆不能直接进入生产上下文，必须经过候选、审核和版本治理。
- 所有新能力可通过开关退回 SingleShot 或影子模式。

门禁默认值：

| 指标 | 门槛 |
|---|---|
| 契约通过率 | 100% |
| 严重虚构事实 | 0 |
| daily rubric pass rate | ≥ 80% |
| 相对基线质量下降 | ≤ 5 个百分点 |
| 模型评估不可用 | 发布失败；仅业务负责人书面签核可临时绕过 |

---

## 二、拍板结论（关闭设计稿 §8）

| # | 议题 | 结论 |
|---|---|---|
| 1 | P0 顺序 | **评估门禁（阶段 1）先行**；**内容增长闭环为业务主线（阶段 2）**；销售 Loop 为第二试点，不阻塞内容 |
| 2 | ToolLoop 首批路径 | **内容选题核验 + 销售诊断补证** |
| 3 | eval:daily 成本 | 先按现有 daily（15×2）配置；超预算再下调 sample |
| 4 | Skill 真源 | 仓库方法论文档 + 已发布命名方法论 profile 协同；自动生成仅进候选 |
| 5 | 群聊选题管道 | **纳入本季度**，作为阶段 2 `content-growth-v1` 主路径 |

明确不实施（P3）：多 Agent、SFT/RL、模型自由选择写工具/外发副作用。

---

## 三、实施阶段

### 阶段 1：评估门禁与基线（0–2 周，P0）

- 保留 `eval:deterministic` 作为每个 PR 的快速门禁。
- 主干合并及候选发布运行 `eval:daily`；缺少模型密钥、报告缺失或门槛不达标时失败。
- 每周或模型、Prompt、上下文策略变更前运行 `eval:full`。
- 增加 `eval:model-swap`：同一批冻结样本比较当前模型与对照模型。
- 将 daily eval 纳入 `release-verify.mjs`；评估报告作为 CI artifact。
- 建立内容生成基线：接受率、重写率、证据完整率、严重虚构率、平均延迟、单次成本。
- `AimRunSpec` 增加冻结 `executionPolicy`（默认 `single_shot`）。

### 阶段 2：内容增长闭环生产化（2–5 周，P0）

- 注册并启用 `content-growth-v1` Business Loop（不另建执行器）。
- 群聊灵感管道统一接入 Harness、Trace、Snapshot、质量验证与候选资产。
- 固化飞书/渠道绑定字段契约，增加 schema 漂移检查。
- 网页、群聊、上传文档、工具结果统一标记为不可信上下文。
- 输出必须含候选选题、证据引用、信息不足提示、人工审核状态。
- 固定写入由工作流执行；Tool Loop 不得直接发布/发客户消息/改正式知识库。

灰度：`capture_only` → `evaluate` → 单渠道 `live` → 稳定 48h 后 25% → 再 48h 后 100%。

进入下一阶段条件：≥30 真实影子样本、连续 5 工作日无 P0/P1、严重虚构 0、幂等抑制有效、失败可重试。

### 阶段 3：有界工具调用（4–8 周，P1）

Harness 内 `BoundedToolLoop`；SingleShot 仍为默认。

首批只读工具：`search_project_knowledge`、`get_project_memories`、`read_aim_generation`、`read_work_item`、`request_human_review`。

默认限制：maxSteps=6；单工具超时 10s；整环 60s；maxAutoRetries=1；白名单冻结；禁止写/外发/跨项目。

上线：deterministic fixture → 真实模型影子 → 内容试点 → 销售试点。异常可独立开关回退 SingleShot。

### 阶段 4：记忆治理与外部化学习（8–11 周，P1）

- 生命周期：`candidate → active → superseded/rejected`。
- 新提取默认 candidate；召回考虑项目/Agent/类型/相关性/时效/状态。
- generate 与 chat 同一召回策略；计入预算、Manifest、Hash。
- ≥20 条记忆评估集；轨迹→脱敏 Eval/Skill 候选，人工批准后进正式资产。
- 复用 AssetCandidate 审批语义。

### 阶段 5：工具治理、安全与维护性（11–14 周，P2）

- Tool Registry；未注册/未授权一律拒绝。
- 上下文信任级别、长度限制、脱敏、引用追踪、注入隔离。
- 统一错误分类与 Trace 工具步字段。
- 长函数不得高于基线（只拆本计划热点）。
- Trace 保留期、敏感 Snapshot 清理、账号删除、备份恢复演练。

---

## 四、接口与契约

```ts
interface AimExecutionPolicy {
  mode: "single_shot" | "bounded_tool_loop"
  allowedToolNames: string[]
  maxSteps: number
  timeoutMs: number
  maxAutoRetries: number
}
```

- `AimContextSource` 增加 `trustLevel` 与可选 `sourceRef`。
- `AimRunMetadata` 增加 `stopReason`、`toolStepCount`、工具失败数、人工接管状态。
- `BusinessLoopTrigger` 增加内容灵感采集；注册 `content-growth-v1`。
- HTTP 未传执行策略 → 解析为 `single_shot`。
- DB：先加记忆治理字段并回填 active，再切写入逻辑；不删旧字段。

兼容说明：过渡期内 `AimRunSpec.executionMode` 与 `executionPolicy.mode` 保持同值；新代码以 `executionPolicy` 为准。

---

## 五、工作包与分支（可开线程清单）

每个条目一个独立分支/worktree，禁止混提。合并顺序按依赖：阶段 1 → 2 → 3 → 4 → 5。

| 优先级 | 分支 | 阶段 | 完成标准 |
|---|---|---|---|
| P0 | `feat/eval-daily-gate` | 1 | release-verify / 候选发布必跑 daily；缺密钥失败；报告 artifact |
| P0 | `feat/eval-model-swap` | 1 | `eval:model-swap` 产出对比报告与 bottleneck 标签 |
| P0 | `feat/execution-policy-spec` | 1 | `AimExecutionPolicy` 默认 single_shot；未授权不可进 ToolLoop |
| P0 | `feat/content-baseline` | 1 | 基线 JSON/MD 可比较；门禁 -5pp 可计算 |
| P0 | `feat/content-growth-loop-register` | 2 | `content-growth-v1` 进 Registry；影子可跑 |
| P0 | `feat/content-channel-field-contract` | 2 | 渠道/飞书字段契约 + schema 漂移检查 |
| P0 | `feat/content-untrusted-context` | 2 | trustLevel 标记；注入不可覆盖系统策略 |
| P0 | `feat/content-growth-rollout` | 2 | capture→evaluate→live 灰度与 30 样本验收 |
| P1 | `feat/bounded-tool-loop-kernel` | 3 | maxSteps/超时/白名单/人工接管；fixture 绿 |
| P1 | `feat/tool-loop-content-verify` | 3 | 选题核验路径 + 不足信息 fixture |
| P1 | `feat/tool-loop-sales-supplement` | 3 | 销售补证路径 + 证据缺口 fixture |
| P1 | `feat/memory-lifecycle-governance` | 4 | candidate 默认；召回过滤状态 |
| P1 | `feat/memory-eval-suite` | 4 | ≥20 标注集可跑 |
| P1 | `feat/trace-to-eval-skill-candidates` | 4 | 候选管道 + AssetCandidate 闸门 |
| P2 | `feat/tool-registry` | 5 | 未注册拒绝；读写分组 |
| P2 | `feat/trust-boundary-errors-trace` | 5 | 信任级 + 错误分类 + Trace 工具步 |
| P2 | `feat/ops-lifecycle-drills` | 5 | 保留期/清理/备份恢复演练记录 |

本分支 `feat/aim-gap-phase-a` 为阶段 1 收敛落地（含部分阶段 3 内核预埋）；合并前须拆出可独立验收的 diff，或整包按阶段 1 完成标准验收后再开阶段 2 线程。

---

## 六、测试与验收（四层）

1. 代码：单测、类型、Lint、arch；ToolLoop/Registry 契约测试。  
2. 构建：影响 Runtime 的改动过生产构建。  
3. 集成：飞书真实读写、eval:daily、ToolLoop 最小真实检索。  
4. 上线：明确 commit；healthz；开关可回读；可回滚。

必须覆盖（摘要）：未授权不可进 ToolLoop；非白名单/跨项目/副作用拒绝；步数/超时/重试有效；工具结果注入不可覆盖策略；信息不足明确警告；失败转人工且 Trace 完整；SingleShot fixture 100% 回归；内容与销售各 ≥3 成功/不足/工具失败样本；记忆候选未经审核不进上下文；daily/full/model-swap 可比较。

正式灰度前仍需：真实渠道字段清单、生产模型与开关、近期脱敏 Trace、内容接受/重写数据、成本延迟、备份恢复结果。缺证据时只能代码+影子验收。

---

## 七、与既有文档关系

| 文档 | 关系 |
|---|---|
| `2026-07-24-aim-agent-gap-upgrade-design.md` | 设计稿；拍板结论以**本正本**为准 |
| `aim-ai-native-company-zcode-execution-plan.md` | 经营控制面正本；本计划不替代 |
| `aim-content-asset-system-upgrade-plan-2026-07-23.md` | 内容资产经营主链；阶段 2 与其对齐，不另建 Runtime |
| ADR-001 | ToolLoop 是 Harness 内模式，不是新内核 |

---

## 八、本正本下的立即行动

1. 完成阶段 1 代码与测试（本分支收敛）。  
2. 阶段 1 合并并通过 daily 门禁后，新开 `feat/content-growth-loop-register`。  
3. 每个新线程开工声明：目标、允许/禁止修改范围、完成标准。

---

## 九、本分支落地进度（`feat/aim-gap-phase-a`，2026-07-24）

| WP | 状态 | 备注 |
|---|---|---|
| eval-daily-gate / model-swap / execution-policy / content-baseline | 已落地代码 | release-verify 含 daily；缺密钥失败 |
| content-growth-loop-register / channel-contract / untrusted-context | 已落地代码 | 默认 `capture_only`；trustLevel 注入隔离 |
| content-growth-rollout | 门禁函数已落地 | 真实 ≥30 样本仍待生产证据 |
| bounded-tool-loop-kernel / tool-registry / trust-errors-trace | 已落地代码 | L0 五工具 + Registry 拒绝 |
| tool-loop-content-verify / sales-supplement | 核验器 + fixture 已落地并接线 | 内容/销售各 ≥3；evaluate/live 跑核验，fail 阻断正式写入 |
| memory-lifecycle-governance / memory-eval-suite | 已落地代码 | `eval:memory`；API `PATCH /api/aim/memories/[id]` |
| trace-to-eval-skill-candidates | 候选草稿已落地 | 不自动写正式 fixtures |
| ops-lifecycle-drills | runbook 已建 | 需运维填写演练记录 |

接线说明（本提交）：`runContentTopicVerification` 已接入 `inspiration-pipeline`（evaluate）与 `topic-chat-service`（live）；核验 fail 不写 TopicSelection。

合并前建议：按阶段拆 PR，或整包验收阶段 1 完成标准后再开阶段 2 独立线程。
