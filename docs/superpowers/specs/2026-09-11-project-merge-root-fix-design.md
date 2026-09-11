# 项目合并根治设计

**日期：** 2026-09-11

**状态：** 已获方案确认，待产品负责人评审本文档

**范围：** 明动 AIM 多账号共享项目的安全合并能力

**不含：** 多项目自由切换、成员邀请 UI、跨组织权限体系、删除源项目

## 1. 目标与成功标准

把现有一次性合并脚本收敛为可重复、安全、可审计的项目合并领域能力。任何项目合并必须同时满足：

1. 源、目标两侧参与账号被完整识别；未绑定账号绑定目标，已绑定第三项目则整体拒绝。
2. 项目、成员、账号与冲突检查在同一事务内重新读取并锁定，不使用事务外快照决定写入。
3. 所有项目作用域表都有明确的 `move` 或 `retain` 策略；Schema 出现未登记的新表时拒绝执行。
4. 内容、运行链路与 API Key 权限保持一致；不可改写的审计事实和源成员历史保留原项目。
5. 存在运行中任务时拒绝合并；任意一步失败时账号、成员、内容、权限、项目状态与审计全部回滚。
6. apply 必须提供完整 source→target 确认、有效管理员、原因和请求标识；成功变更有事务内审计记录。
7. 测试直接执行领域服务并验证数据库调用与回滚语义，不再以源码字符串作为主要证据。

## 2. 已验证根因

当前实现的根因不是单个缺表，而是合并规则散落在命令脚本中：

- 项目、成员、账号与第三项目冲突在事务外读取，存在检查后状态变化的时间窗口。
- 参与账号只覆盖源项目一侧和目标 owner，没有覆盖目标 members / boundAccounts。
- `PROJECT_TABLES` 是手工内容白名单；线上缺表可以跳过，但 Schema 新增项目表时无法判断应迁移还是保留。
- `User.boundProjectId` 已切到目标，但 `AgentApiKey.allowedProjects` 没有同步。
- 合并没有正式管理员审计，测试仅验证脚本包含若干字符串。

生产核验显示，本次两个账号的内容数据已经正确迁入目标项目；源项目仅保留 `ProjectMember`、`AuditEvent` 与一条关联已迁移生成记录的 `AimExecutionTrace`。这说明当前实例没有内容丢失，但运行轨迹与目标项目统计已出现不一致，通用工具也不适合继续复用。

## 3. 方案选择

采用“领域服务＋薄 CLI＋显式迁移策略”。不继续扩大单文件脚本，也不引入数据库存储过程。

- 领域服务负责预览、事务、锁、迁移、权限和审计。
- CLI 只负责参数解析、展示预览和调用领域服务。
- 表策略是代码内受审清单，并由 Schema 完整性测试守护。
- 使用现有 Prisma、`ProjectMember`、`AdminAuditLog` 和管理员模型，不建立第二套权限或审计系统。

## 4. 组件与边界

### 4.1 `project-merge-policy`

维护全部直接含 `projectId` 的表及其策略：

**迁入目标项目（move）：**

- 客户内容：`AimGeneration`、`AimMemory`、`KnowledgeEntry`、`KnowledgeEntity`、`Script`、`ContentGenerationRun`、`TopicSelection`、`Inspiration`、`IpWikiPage`、`CompetitorAnalysis`、`WatchAccount`、`VideoCopyExtraction`、`BenchmarkProfile`、`AssetCandidate`、`OpportunityCollection`、`UserQuestionCard`、`ChannelBinding`、`AimConversation`、`ContentOutcome`、`CustomerOutcomeProjection`、`VideoStructure`。
- 与内容共同生效的运行链路：`AgentInvocation`、`AimExecutionTrace`、`AimRunSnapshot`、`ApprovalDecision`、`LearningCandidate`。

**保留原项目（retain）：**

- `ProjectMember`：保留源项目历史，并在目标项目 upsert 新成员。
- `AuditEvent`、`AgentApiCallLog`：作为已发生事实，不改写历史项目归属。

服务执行前从 `information_schema.columns` 读取所有已部署的 `projectId` 表：

- 策略中存在但线上未部署：跳过，支持滚动版本差异。
- 线上存在但策略未登记：拒绝 apply，要求先评审该表语义。
- dry-run 输出实际 move / retain / missing / unknown 清单与逐表数量。

### 4.2 `project-merge-service`

公开两个入口：

```ts
previewProjectMerge(input): Promise<ProjectMergePreview>
applyProjectMerge(input): Promise<ProjectMergeResult>
```

服务接收注入的数据库客户端，CLI 和测试使用同一套真实业务逻辑。`apply` 输入至少包含：

- `sourceProjectId`
- `targetProjectId`
- `expectedSourceOwnerId`
- `expectedTargetOwnerId`
- `adminId`
- `reason`
- `requestId`
- `confirmation`，值必须精确等于 `${sourceProjectId}->${targetProjectId}`

### 4.3 薄 CLI

CLI 默认 dry-run。apply 必须同时提供 `--apply`、完整方向确认、管理员 ID、原因和两个预期 owner。CLI 不直接拼接业务 SQL，不自行维护表列表。

## 5. 事务与并发控制

`applyProjectMerge` 使用一个交互式事务，按固定顺序执行：

1. 使用 `SELECT ... FOR UPDATE` 锁定源、目标 `ClientProject`。
2. 在事务内读取两侧 owner、members、boundAccounts，并锁定得到的全部 `User` 行。
3. 再次读取成员和绑定，形成稳定参与账号集合：两侧 owner、members、boundAccounts 的并集。
4. 验证 source/target 不同、预期 owner 匹配、目标 active、源未 archived、管理员有效。
5. 若任一参与账号绑定到 source/target 之外的项目，整体拒绝。
6. 检查源项目 `AgentInvocation` 的 queued/running 状态及 `AimExecutionTrace` 的 running 状态；存在活动任务则拒绝。
7. 检查表策略无 unknown 项。
8. 在目标项目 upsert 全部参与账号；目标 owner 为 `owner`，其他为 `member`。源 `ProjectMember` 不删除。
9. 绑定未绑定或仍绑定 source 的参与账号到 target；更新后断言应更新数量与实际数量完全一致。
10. 按 move 策略逐表顺序更新 `projectId`，记录逐表影响行数。
11. 重写参与账号 API Key 的 `allowedProjects`：仅把 source 替换为 target，保留其他授权并去重；空数组的旧兼容语义保持不变。
12. 归档源项目。
13. 在同一事务写入 `AdminAuditLog`，metadata 只包含项目 ID、账号数、逐表计数、API Key 数和原因，不写客户正文或密钥。
14. 提交事务；任一步抛错均回滚。

不在事务内使用 `Promise.all` 并发发 SQL，保持锁顺序和错误位置确定。事务设置足够但有限的超时；超时即回滚，不自动重试高风险合并。

## 6. API Key 与权限语义

账号仍只选择一个 `boundProjectId`，项目可有多个成员。访问项目必须同时满足：

- 账号的 `boundProjectId` 等于请求项目；
- 账号是项目 owner 或 `ProjectMember`；
- 项目状态为 active。

API Key 保持现有最小授权：

- `allowedProjects` 包含 source 时替换为 target。
- 已包含 target 时去重。
- 不包含 source 的其他授权不改。
- 不读取、不记录或重新生成 Token。

## 7. 审计与失败恢复

成功合并写入 `AdminAuditLog`：

- action：`account.project_merge`
- targetType：`ClientProject`
- targetId：目标项目 ID
- status：`success`
- severity：`warning`
- requestId / correlationId：来自本次 CLI 调用
- metadata：source、target、reason、participantCount、movedRows、remappedApiKeys

事务失败不会留下成功日志。CLI 对失败打印可行动错误，不打印环境变量、Token、内容正文或密码。源项目只归档，不删除，因此已完成合并的人工恢复策略是执行独立、同样受审的反向合并或明确的数据修复，不提供无条件自动回滚命令。

## 8. 测试设计

### 8.1 领域服务单元测试

- dry-run 不调用任何写方法。
- 确认方向、owner、管理员或原因错误时拒绝。
- 两侧 owner/member/boundAccounts 被完整合并并去重。
- 任一账号绑定第三项目时，在首个写入前拒绝。
- 事务内状态变化会被重新检测。
- 活动 invocation/trace 阻止合并。
- API Key source→target 替换、去重及无关授权保留。
- 任一表更新、成员 upsert、API Key 或审计失败时事务回滚。

### 8.2 策略完整性测试

- 解析 Prisma Schema，枚举所有 `projectId` 模型。
- 每张表必须恰好归入 move、retain 或显式的非项目实体豁免。
- 新增未登记表使测试失败。
- 线上缺少策略内表时 preview 标记 missing，apply 不因该表报错。

### 8.3 数据库集成测试

在测试 MySQL/MariaDB 建立两个项目、两侧成员、API Key、运行轨迹和内容：

- 验证成功后内容和运行链路迁入、审计历史保留、源成员历史保留、源归档。
- 注入中途错误，验证全部数据保持原样。
- 模拟第三项目绑定及活动任务，验证零写入。
- 执行两次 apply，第二次明确返回“源已归档”，不产生重复成员或重复审计。

## 9. 上线与现有数据修复

1. 代码层：定向单测、数据库集成测试、主/测试 TypeScript、Schema、架构和 API 契约通过。
2. 构建层：若只新增脚本和领域服务且不进入运行时路由，可不重启 Web；若复用运行时代码发生变化，则必须生产构建。
3. 集成层：在生产只读 dry-run 中确认两侧项目、参与账号、表策略、活动任务与 API Key 影响。
4. 数据修复：在新服务可用后，把当前遗留的 1 条 `AimExecutionTrace` 迁到目标项目；对应 `AuditEvent` 保持源项目不变，并写一条管理员修复审计。
5. 上线层：从明确提交推送，CI 全绿后执行最小发布；回读账号绑定、成员、源/目标状态、逐表计数、API Key 和审计记录，再检查 healthz。

## 10. 完成边界

本工作包只根治项目合并安全性。成员邀请、权限撤销、多项目切换和共享项目 UI 不在本次范围；发现这些需求时另开工作包，不在合并服务中顺带扩建。
