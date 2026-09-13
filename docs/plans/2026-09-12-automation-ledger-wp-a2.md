# WP-A2 自动化台账（V1 只读 + V2 可操作）

> 状态：代码完成，放量待做 · 日期：2026-09-12 · 分支：`feat/wp-a2-a6-batch1`
> 上游：《明动AIM-竞品借鉴增量升级计划-2026-09-12》WP-A2
> 红线：不新建调度器；不启停 systemd timer；开关只让任务空转；立即执行走现成 cron + 管理员鉴权 + 五分钟互斥。

## 1. 改了什么

### V1 只读

- `/scheduled-tasks` 从静态卡片改成「自动化台账」：任务名 / 干什么 / 多久跑一次 / 上次能看见的执行证据 / 健康态。
- 数据拼三处现成来源：后台任务表 `BackgroundTask`、经营告警 `OperationalAlert`、审计对账检查点 `AuditReconcileCheckpoint`。探针成功结果没有落库，所以探针任务的健康态只看告警，不编造「上次成功时间」。
- 读接口 `GET /api/aim/automation-ledger`，登录用户可看。

### V2 可操作

- 「立即执行」：`POST /api/admin/automation-ledger/run`。管理员 cookie 鉴权，走现成 cron `GET`，带 `CRON_SECRET`。同一任务五分钟内不可重复点（互斥键写进 `BackgroundTask.idempotencyKey`）。
- 「停用」开关：`PATCH /api/admin/automation-ledger/flags`。只改 `SystemSetting` 覆盖位；cron 入口经 `authorizeCronJob` 空转。生产 timer 仍要 ops 审批才停。
- env 灰度：`AIM_JOB_DISABLED=topic-daily,cleanup`（逗号分隔）。库里的覆盖优先于 env。
- 普通控制台用户点按钮会 401，文案是「需要管理员登录才能操作」。这是按计划做的，不是漏了权限。

## 2. 不做

- 不写第二套调度器，不写新的执行记录表。
- 不在 UI 上停 systemd timer。
- 不碰 `outcome-autofetch.ts`。

## 3. 验收

- 单测：`automation-ledger`、`automation-ledger-v2`（目录用业务名、告警映射健康态、开关覆盖、互斥窗口）。
- 代码层：非技术用户能看懂每天自动做什么；立即执行有管理员审计。
- 放量级：真实账号打开页面能对上生产 timer；立即执行互斥在生产生效。见 `docs/reports/2026-09-12-a-series-rollout-draft.md`。
