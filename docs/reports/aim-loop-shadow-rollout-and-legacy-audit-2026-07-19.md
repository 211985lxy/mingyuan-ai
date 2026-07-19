# AIM Loop 影子灰度与遗留分支审计（2026-07-19）

## 结论

销售诊断黄金 Loop 已完成代码、真实飞书结构和单样本影子灰度验证，但生产 live 模式仍保持关闭。本次审计的代码基线为 `86bc5e7`。

影子运行使用中汝达真实会议逐字稿，最终结果如下：

- 调度：`scanned=4`、`started=1`、`succeeded=1`、前三条历史运行由确定性 Trace 去重。
- 验证：13/13 确定性检查通过，高风险事实编造 0，所有证据引用均能在原文定位。
- 持久化：Trace、AimRunSnapshot、AimGeneration 三者已通过 `runId` 和结果 ID 关联。
- 模型：APIMart `gpt-5.2-chat-latest`。
- 本次成功运行：输入 3854 Token、输出 994 Token、合计 4848 Token，成本约 0.03915 元。
- 飞书：应用在影子运行期间保持零写入、零通知；验证结束后由人工监督者把成功记录提交到 `待人工审核`。
- 停止条件：再次扫描为 0，没有继续产生模型调用。

## 灰度中发现并修复的问题

1. `lark-cli` 真实记录列表为 `data.data + data.fields + data.record_id_list` 矩阵，旧解析器只认 `items/records`；已补兼容和回归测试。
2. APIMart `gpt-5` 会把输出预算全部消耗在 reasoning token，出现空正文；运行模型改为 `gpt-5.2-chat-latest`。
3. 模型曾推断无依据决策阶段并生成非连续引用；已收紧 prompt，确定性验证器未放宽。
4. AimRunSnapshot 曾写入 Prisma 未声明的 token/cost 字段；现由 AimExecutionTrace 保存长期模型、token 和成本遥测。
5. 本地数据库迁移历史与真实列漂移；为灰度补齐 AimGeneration 的 `taskSpec`、`topicSelectionId`、`selectedTopicIndex`。生产发布仍须走正式 schema 门禁，不能复制本地手工补列流程。

## 遗留分支结论

| 分支 | 结论 | 依据与后续 |
|---|---|---|
| `feat/aim-afu-card-bridge` | 待重新移植，禁止机械合并 | `main` 曾移植后在 `5e656d2` 明确回退；当前分支仍新增旧版 Base/store 改动，会覆盖矩阵兼容与灰度边界。待销售 Loop live 门通过后，按当前接口重做最小 Card 桥接。 |
| `docs/afu-wp0-contract` | 待选择性移植，禁止整分支合并 | ADR-002 与更新版计划已固化“Markdown 非唯一真源、Base 管执行状态、日历仅投影”，可选择性移植；其中 WP-0 外部结构审计仅代表字段扩建前的历史快照（当时 11 字段），当前 Base 已为 31 字段，合入时必须标注已被后续真实结构取代，不得继续表述为当前结构。 |
| `docs/afu-company-task-upgrade-plan` | 废弃为重复分支 | 单文件计划已被 `docs/afu-wp0-contract` 的同类计划与 ADR/审计报告覆盖，不应单独合并。 |
| `hotfix/aim-intent-csrf` | 已覆盖，可归档 | `a86f257` 与 `main` 的 `ed390a5` patch 等价；`37ad181` 的新任务隔离、上下文隔离和指令优先级语义已存在于当前重构后的 intent/chat 模块和测试中。 |

## 仍未满足的生产条件

- 尚未完成 10 场真实销售会议扩大灰度和连续 5 个工作日观测。
- 生产环境尚未启用 Business Loop 开关、试点项目和监督群配置。
- 生产数据库须先通过备份、迁移状态、Schema 契约和回滚演练；本地数据库已确认存在历史漂移。
- `AssetCandidate` 生产表迁移必须真实验证后，才能开放人工批准后的企业记忆晋升。
- Afu Markdown Card/日历桥接暂不进入本次生产发布范围。
