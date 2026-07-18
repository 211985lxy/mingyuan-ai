# 明动 AIM × 飞书 90 天升级 · 代码交接报告（2026-07-18）

- 分支：`fix/agent-prompt-logic-conflicts`（已 rebase 到 `origin/main` 之上，9 个提交 `d25bb78..222179a`，与 main 零分叉）
- 交接对象：Codex（审查、完整门禁复核、合并 `origin/main`、生产部署）
- 计划正本：《明动AIM-飞书AI原生公司90天升级计划》（工作区）

## 一、提交清单（全部本地门禁绿）

| 提交 | 内容 | 计划章节 |
|---|---|---|
| `d25bb78` | 基线：修复 12 处智能体 prompt 逻辑冲突 | 0.1 |
| `abaff0a` | 任务语义路由锁定，Harness 119/119 | 0.1 / 0.2 |
| `e490bb9` | 发布事实固化：release-manifest + `/api/healthz` 回读 releaseSha/buildTime/version/feishuReady/proxyReady | 0.3 |
| `def3bc8` | execute 入口补齐飞书配置缺失 503 验收 | 1.2 |
| `b0d7472` | 会议洞察真实存储适配器 + `POST /api/integrations/feishu/work-items/meeting-insight` | 2.1 / 2.2 |
| `5f398bc` | 会后资产候选（AssetCandidate 表 + 双人工闸门 + 三个 API）+ 第 7/30 天回填提醒 | 3.1 / 3.2 |
| `c39bcba` | 每周经营复盘五主指标 + 第 7 天回填率（`GET /api/aim/review/weekly`） | 3.3 |
| `d4e8adb` | WP-8 无人值守调度：幂等键、执行租约、指数退避（1/5/15 分钟 ×3）、连续失败升级人工接管 | 6.1 |
| `222179a` | 知识来源类型补齐 meeting_insight 常量与标签（阶段 5 预审发现项） | 5 |

## 二、门禁结果（合并前需复核）

- 全量单测 1257/1257（202 个文件）；确定性 Harness 119/119（100%）
- `eval:deterministic` 契约 100.0%，无失败用例、无质量发现
- 双侧 typecheck 0 错误；ESLint 0 错误；arch/db:bounds/api-contracts（158 路由）全过
- 真实模型评估（`eval:daily`）未跑：本地无模型密钥，合并前必须在有密钥环境执行并达标（契约 100%、质量 ≥80%、虚构事实 0）

## 三、生产发布要点

1. `prisma migrate deploy`（含 `20260718100000_add_asset_candidate` 新表迁移）+ `prisma generate`（生成客户端被 gitignore）+ `schema:verify` 复核（契约已含 AssetCandidate 表）。
2. 飞书「AIM经营事项」表预建调度字段：`执行租约截止`（日期时间）、`执行租约持有者`（文本）、`重试次数`（数字）、`下次重试时间`（日期时间）、`需人工接管`（复选）。
3. 飞书环境变量五项：`LARK_BASE_TOKEN`、`LARK_WORK_ITEM_TABLE_ID`、`LARK_CLI_PATH`、`AIM_WORK_ITEM_API_SECRET`、`AIM_WORK_ITEM_OWNER_USER_ID`；lark-cli 固定版本+校验值；机器人最小权限。
4. 部署后验证：`/api/healthz` 的 `releaseSha` 等于本次合并 SHA、`feishuReady=true`；登录鉴权、AIM 真实生成、飞书读写（一条测试记录走完 待处理→处理中→待人工审核→已完成）、回滚点确认；创建 `prod-YYYYMMDD-N` 标记并记录 Git SHA。
5. 凭据轮换（计划 0.4）与发布同日完成：APIMart Key、代理订阅与节点认证、服务器 root 密码；确认 SSH Key 后关闭密码登录。

## 四、设计契约与边界（审查重点）

- 资产候选双人工闸门：会议洞察须人工 approve（写回 `taskSpec.humanReview`）才生成候选；候选 approve+promote 才升级正式知识，跨项目复用须显式批准；同向操作幂等。
- ContentOutcome 空值语义：null 不当 0，显式填 0 是有效回填。
- 提醒与周报接口只读：`GET /api/aim/outcomes/reminders`、`GET /api/aim/review/weekly`；飞书推送由自动化轮询后决定，应用不主动外发。
- WP-8 调度自动化只推进内部状态，不能自动对客户发送、报价、发布或删除。
- cron 路由暂缓接线：等生产表字段契约（会议原文/项目ID 等字段名）确定后再接 `execute` 端口，不臆造字段名。
- 合并完成后才允许清理旧 worktree 与已合并分支（计划 0.3）。
