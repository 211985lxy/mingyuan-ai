# 统一统计/审计中心生产运行手册

## 当前代码交付边界

本分支交付了数据库迁移、统计/审计 API 与页面、告警收件箱、Metrics 鉴权、留存 report-only 入口和 SLS canary 检查清单。以下动作必须在生产审批后执行：

- 生产数据库迁移
- ECS 安装/升级 LoongCollector
- systemd/timer 调度变更
- SLS Project/Logstore 创建或修改
- `execute=true&confirm=DELETE-180-DAY-ROWS` 的真实留存删除
- 从已验证 commit 部署到生产

## 部署记录（2026-09-10 23:36 CST）

- 发布版本：`main` @ `89d7df594646d199febabae52ebec84895636a3a`（healthz 回读一致）
- 生产迁移：`20260910100000_unified_control_centers` 已应用（`prisma migrate deploy`，SSH 隧道），`production-schema-contract-ok tables=40`
- 调度上线：`mingyuan-cron-audit-reconcile.timer`、`mingyuan-cron-operational-alerts.timer`（每 5 分钟，已首跑成功）；`mingyuan-cron-channel-metrics-rollup.timer`（每日 00:10）；`mingyuan-cron-control-center-retention.timer`（每日 03:30，report-only）
- 首跑结果：留存预览 `auditEventExpired=0, channelMetricDailyExpired=0, execute=false`；对账 3 个源 checkpoint 建立、0 失败；告警检查 `created=0`
- 边界验证：`/api/metrics` 匿名 401；`/admin/statistics`、`/admin/audit-center` 匿名 307 跳登录
- 后续 7 天：留存保持 report-only，每天核对 `totalExpired` 后再人工审批真实删除

## 发布前检查

1. 使用干净 commit 执行 `pnpm --filter @mingyuan/web run typecheck`、`lint`、`api:contracts`、`db:bounds`、`schema:migration-integrity`。
2. 先执行 `prisma migrate deploy` 的 dry-run/审批流程，确认 `20260910100000_unified_control_centers` 只含增量表和字段。
3. 生产设置 `METRICS_SCRAPE_SECRET`，长度至少 32 字符；Prometheus 抓取带 `Authorization: Bearer`。
4. 保持 `AIM_LOOP_NOTIFICATIONS_ENABLED=false` 完成后台收件箱验证；确认无误后再按通知审批打开。
5. 先调用留存入口 report-only，人工核对 `totalExpired`，前 7 天不执行真实删除。

## 定时任务

目标调度（均使用 `CRON_SECRET`）：

- 审计对账：每 5 分钟调用 `/api/cron/audit-reconcile`
- 渠道日汇总：每天 00:10 调用 `/api/cron/channel-metrics-rollup?day=<上一上海日>`
- 告警检查：每 5 分钟调用 `/api/cron/operational-alerts`
- 留存预览/清理：每天 03:30 调用 `/api/cron/control-center-retention`

调度器必须记录 HTTP 状态、响应摘要、request/correlation ID；不得把 `CRON_SECRET` 写入命令行日志或 SLS。

## 告警处理

- `warning`：只在后台收件箱处理。
- `error/critical`：按 fingerprint 去重；确认、解决、重开动作必须在告警页完成。
- 飞书通知复用 supervisor 通道；发送失败不阻断业务，下一次超过 15 分钟抑制窗口后重试。
- 审计对账延迟、AIM 失败率和 SLS 心跳异常先查统计中心新鲜度，再用关联 ID 跳转审计中心/SLS。

## 回滚

1. 关闭统计/审计页面入口和对账/告警/留存调度。
2. 保留已写入的专用来源日志、`AuditEvent`、日指标和告警数据。
3. 回滚应用到前一个已验证 commit；不要删除新表或回滚已执行的增量迁移。
4. Metrics 未授权请求仍必须返回 401；若抓取配置未同步，暂时暂停抓取而不是开放匿名访问。

## 本地冒烟记录（2026-09-10，Task 9 Step 4）

代码版本：`codex/unified-control-centers` @ `4bec9e1b`（本地 dev server，端口 3000）。

已验证：

- `GET /api/metrics` 无 Authorization 返回 401；伪造 Bearer 返回 401。
- 匿名访问 `/admin/statistics`、`/admin/audit-center` 均 307 跳转 `/admin/login`。
- `/admin/login` 渲染 200。
- 非管理员会话访问 `/api/admin/statistics/overview`、`/api/admin/audit-events`、`/api/admin/alerts` 均被拒绝（401），管理员边界生效。

待本地管理员凭据就绪后补测（不阻塞生产审批门）：

- 管理员会话下两个中心的汇总数字、分页与详情抽屉。
- 告警确认/解决/重开状态流转（写操作，验证时使用本地库）。

以下写操作一律留到生产审批之后：真实留存删除、告警流转演练在生产库执行、SLS 资源创建与 LoongCollector 安装。
