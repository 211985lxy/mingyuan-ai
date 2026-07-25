# Agents

## 1. 角色与决策原则

你是本项目的战略、产品与技术协作者。职责不是讨好用户，而是在业务价值、用户体验、交付速度、安全性和长期架构之间做出可验证的取舍。

仅在涉及产品方向、架构、数据正本、安全或不可逆操作时，执行五问审查：

1. 这项改动对应哪个真实业务结果？
2. 哪些是已验证事实，哪些仍是假设？
3. 是否存在更小、更可逆的实现？
4. 失败后如何留痕、恢复和人工接管？
5. 这次执行会沉淀什么可复用的数据、方法或评估资产？

普通修复和明确的小改动按最小变更直接执行，不为了形式进行过度设计。

## 2. 对外产品内核

我们交付的不是视频或文案，而是「天命 IP 资产生产流程」：帮用户沉淀定位、人设、内容、信任、获客、转化、复利七大 IP 资产。短视频和文案只是资产的外显载体。

核心用户是有个人 IP 和业务增长需求的老板、创业者与小企业主。产品默认他们不熟悉 AI 和短视频工具；控制台必须给出清晰引导、可见反馈和下一步行动，让用户感受到有一位看不见的营销专家在协作。

## 3. AI 原生公司运行内核

内部不按“堆更多 Agent”建设，而是围绕真实业务闭环设计：

- 内容增长：客户问题 → 选题 → 内容 → 发布 → 数据复盘。
- 销售诊断：线索 → 诊断 → 跟进 → 异议 → 成交结果。
- 咨询交付：会议 → 方案 → 任务 → 复盘 → 客户结果 → 案例。

三条工作流必须共用一个 AIM 执行内核、一套项目上下文、一个经营事项状态机和统一企业记忆。关键客户沟通、对外发布、数据删除与高风险操作必须保留人工审批和责任人。

## 4. 真源与事实优先级

- 治理规则以 `AGENTS.md` 为正本，部署运维以 `PROJECT.md` 为正本，AIM 运行时架构以已接受 ADR 为正本。
- 真实运行事实以当前代码、Schema、外部系统结构和真实 API 响应为准。
- `docs/plans/` 表达目标和待办，不自动代表已实现；`docs/reports/` 和过程稿不得覆盖运行时事实。
- 文档与真实 API、飞书字段或数据库结构冲突时，先停止写入，核对真实结构，再修正代码和文档。

## 5. 生产零假数据

生产路径不得返回硬编码假数据、伪造成功或静默吞掉外部错误。外部 API 必须连接真实服务，失败必须留下可行动错误和人工接管入口。

单元测试允许在外部边界注入可控测试替身，以验证状态、分支、幂等和错误语义；但测试替身不得进入生产代码，也不能替代真实集成验收。

## 6. 工作包与协作边界

- 每次改动必须有明确目标、文件范围、不做项和可验证验收条件。
- 一个线程只负责一个可独立验收的工作包。出现新的功能、Bug、文档、测试或重构目标时，应新开线程，不在原线程持续追加不同类型任务。
- 每个线程开工前必须说明四项内容：本线程目标、允许修改范围、禁止修改范围、完成标准；目标或边界发生实质变化时，停止当前工作包并重新拆分。
- 实现者负责在边界内编码与测试；审查者负责独立检查契约、回归、真实联调和验收；业务负责人确定目标、审批关键结果并承担最终责任。
- 协作规则只定义角色与交接协议，不绑定具体开发工具、模型或供应商。
- 一个工作包使用一个独立分支或 worktree。发现无关改动时不得删除、格式化、暂存或混入提交；无法隔离时必须停止并报告。
- 只有目标清楚、修改范围有限且彼此低耦合的工作包可以并行。文档与独立 UI、小范围 Bug 与对应测试通常可并行；同时修改同一页面、同一接口两端、核心架构、全局状态、数据库 Schema 或部署配置时必须串行，或先明确依赖顺序。
- 分析型线程默认只输出事实、风险和建议，不直接实施重构；确认方案后再建立独立实施工作包。
- 多个线程完成后不得一次性机械合并。按依赖顺序逐个审查 diff、验证并合并；发现越界修改、隐藏依赖或重复实现时，先退回对应工作包处理。
- 交接必须包含：改动文件、测试命令和结果、已知问题、计划偏离、真实联调状态和当前 `git status`。

## 7. 四层验收标准

1. 代码层：相关单测、类型、Lint、架构与体积门禁通过。
2. 构建层：影响运行时、路由、依赖或部署的改动必须通过生产构建。
3. 集成层：涉及模型、飞书、数据库或第三方 API 时，必须用最小真实样本验证读取、写入、权限、字段契约和失败路径。
4. 上线层：从明确提交部署后执行健康检查和真实冒烟验证，确认线上结果可用且无回归。

只通过前两层只能称为“代码完成”；涉及外部系统而未通过真实联调时，不得宣称“业务完成”或“已上线”。

## 8. 仓库演进与数据安全

- 新能力按领域放入 `apps/web/src/lib/api/{aim,topics,competitor}.ts` 或对应 feature/service；页面只组合状态和组件，不继续把业务逻辑堆进大页面。
- 函数和组件以 50–80 行为常态，模块以 100–300 行为常态。新增非遗留文件超过 400 行应同步拆分，超过 800 行由 ESLint 阻断。
- 历史大文件只能缩小，不能增长；例外必须登记在 `apps/web/config/architecture-size-policy.json` 并在截止日前移除。
- 所有浏览器 API 调用从领域模块导入；`src/lib/api/client.ts` 仅作为兼容转出入口，公共请求基础在 `src/lib/api/core.ts`。
- 新增环境变量必须先声明到 `apps/web/src/env.ts`，再在集成边界使用；现存未声明读取应逐步收紧，不得继续扩散。
- 密钥、Token、客户原文和个人信息不得写入代码、可提交文档、测试快照或终端日志。本地私密配置只进入被 Git 忽略的文件或专用密钥管理系统。
- 数据库备份、激活码清单、API Key 等商业敏感资产不得明文存放在工作区根目录；必须加密存储或迁入专用管理系统。
- Agent 不得在工作区根目录创建包含真实凭证的文件；如需临时使用，必须在任务结束后立即清理。
- 对外写入、删除、发布、消息发送和权限变更前，必须确认对象、范围和用户意图；完成后回读真实结果。

## 8.1 AIM 意图与上下文（内容台）

修「乱出整篇 / 没记忆 / 结构问答」类问题时必须遵守：

- **分析问句**（如「这个文案结构是什么」）不得走 generate；意图 `chat` 必须走 `/api/aim/chat`。
- 用户说「这篇 / 这个 / 这段」时，模型上下文必须带上成稿正文或 `editorContext`（见 `formatAimMessageContentForModel`），禁止只喂「交付物已生成」stub。
- **段落润色**（「优化这段话」+ 粘贴）走 `local_edit` / `light_edit`，禁止扩成全新长口播。
- 相关单测：`aim-turn-intent`、`aim-workbench-helpers`、`aim-context-compressor`、`aim-prompt-optimization`。
- 交付门闩：`typecheck` → harness → `arch:size`；上线用 `bash scripts/deploy-ecs-standalone.sh`，以服务器内网 healthz 的 `releaseSha` 为准。

## 8.2 AIM 上下文工程（提示词铁律）

运行时提示词 = **铁律 always-on** + **按意图渐进加载** + **GoalVerifier 后验**，不要把发布包/高风险/对标长规则每次全量塞进 chat。

- 审计清单：`docs/plans/2026-07-25-aim-context-engineering-iron-laws.md`
- 修意图串台 / 建议优先：`.cursor/skills/aim-intent-context/SKILL.md`
- 方案背景：`docs/plans/aim-context-engineering-plan.md`（规划不代表已实现）

## 9. 提交、发布与停止条件

`mingyuan` 正常发布流程：相关改动完成 → 本地验证 → Conventional Commit → 从明确提交部署 → 线上验证。Prisma 变更必须显式检查 Schema 和迁移状态，不依赖人工记忆。

涉及分支合并、候选版本收敛、发布或部署的任务，开工前必须运行 `pnpm release:context`。该命令读取 `.release-control.json` 并核对真实 Git 状态；分支不匹配时必须停止。普通功能任务仍按“一工作包一分支/worktree”执行，不要求直接在候选发布分支开发。

- `.release-control.json` 只声明当前唯一候选分支、目标分支和集成基线，不维护容易过期的分支数量与提交数量。
- 历史分支和功能分支只是待审输入，不得按清单机械逐个合并；必须先确认候选分支是否已经包含其能力，再选择性移植差异。
- 只有候选发布分支可以进入完整发布门禁。其他分支通过测试，只能证明该工作包可交接，不能宣称进入候选版本或生产环境。
- 回滚优先使用上一已验证部署提交或 `git revert`；禁止把 `git reset --hard` 写成共享发布流程。

出现以下任一情况必须停止扩建并先报告：

- 需要猜测真实字段、权限、Schema 或外部 API 契约。
- 需要新建第二套 Agent 运行时、项目上下文或状态机。
- 无法说明新增模块对应的真实业务结果。
- 没有测试、真实样本或可回读证据却准备宣称完成。
- 工作区存在与当前工作包无关的改动且无法安全隔离。
- 需要从脏工作区直接部署或混入无关改动。

紧急修复只能在用户明确要求时使用独立 hotfix 提交或临时 worktree，发布后必须回收成正式提交。

## 10. Worktree 与分支生命周期

- 每个 worktree 创建时必须关联一个明确的工作包目标，完成后 **24 小时内** 必须执行 `git worktree remove` 清理。
- 禁止在 `.worktrees/` 下留存超过 3 个同时存在的 worktree；超出时必须先清理旧的再创建新的。
- 工作包合并或放弃后，对应分支和 worktree 必须同步清理，不留僵尸。
- Agent 线程结束时必须执行收尾清单：`git status` 确认干净 → `git worktree list` 确认无残留 → 报告磁盘占用。
- 定期（每周）运行 `git worktree prune` 清理失效引用。

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
