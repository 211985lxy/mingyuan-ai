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

### 部署后补记（2026-09-10 23:55 CST）

- `METRICS_SCRAPE_SECRET` 已在生产 env 配置（48 位随机值，仅存于服务器 `/etc/mingyuan/mingyuan.env`）：无凭证 401、带密钥 200。Prometheus 抓取端需配置同一 Bearer 值（服务器上 `grep METRICS_SCRAPE_SECRET /etc/mingyuan/mingyuan.env` 获取）。
- 管理员会话下生产只读验证通过：统计中心 overview（近 7 天运营 67 次执行、成功率 53.6%、新鲜度分源展示、缺失源为 null）、审计汇总（221 条、4 源、failed=29）、审计事件 cursor 分页（limit=3 返回 3 条且有 nextCursor）、告警收件箱空、两个页面均 200。审计索引实时记录了本次验证产生的 API 读取事件。
- SLS/LoongCollector：ECS 位于 `cn-shenzhen`，服务器 aliyun CLI 未配置凭据；创建 Project `mingyuan-prod-observability` 与 Logstore `app-journal`/`nginx-access`（30 天留存）需先提供阿里云凭据或控制台手工创建，之后按 canary 清单安装。

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

## 当前提交构建冒烟记录（2026-09-11，Task 9 Step 4 复核）

代码版本：`codex/unified-control-centers` @ `99ab4078`，使用当前提交构建产物在本地 3101 端口短时启动验证。`/api/healthz` 返回 200，数据库与 Redis 检查均为 `ok=true`；本地未注入发布清单，因此 `releaseSha`/`version` 显示 `unknown`，不作为生产版本证据。

已验证：

- `/api/metrics` 无认证返回 401。
- `/admin/statistics`、`/admin/audit-center` 匿名访问均 307 跳转 `/admin/login`。
- `/api/admin/statistics/overview`、`/api/admin/audit-events`、`/api/admin/alerts` 匿名访问均 401。

本轮未执行管理员写操作、真实留存删除、SLS 资源创建或 LoongCollector 安装。

## 当前提交构建与全量回归记录（2026-09-11，告警恢复通知）

代码版本：`codex/unified-control-centers` @ `55950ca7`。本轮仅在本地验证，未部署生产。

已验证：

- 全量单测：531 个测试文件通过、1 个跳过；3655 个测试通过、2 个跳过。
- 组件测试：25 个测试文件、84 个测试全部通过。
- 生产构建：Next.js 编译、TypeScript 检查和 180 个静态页面生成通过。
- 告警状态流：首次解决会发送一次“告警已恢复”通知；重复解决不会重复发送。
- 提交前门禁：`typecheck`、`arch:size`、`api:contracts`、`env:check` 全部通过。

构建仍有既有 Turbopack 动态文件追踪警告及 middleware 命名弃用提示；不影响本次构建退出码，但应在后续性能/框架升级批次单独处理。

本轮未执行管理员写操作、真实留存删除、SLS 资源创建或 LoongCollector 安装；当前提交不能作为生产已部署版本证明。

## 最新增量回归记录（2026-09-11，日趋势与幂等冲突告警）

实现提交：`d306a8f3`、`24584170`。最新文档提交前的实现内容为：

- 审计幂等键不同载荷会创建 `critical` 告警；告警元数据只保留来源、错误码和已有记录标识，不写入原始幂等键。
- 统计概览新增统一上海日期桶 `dailyTrend`，展示执行、成功、失败、成功率和渠道指标；执行源不可用时对应值保持 `null`。
- 相关审计、统计与组件测试已通过；随后重新完成全量单测、组件测试和生产构建。

本轮仍未执行生产迁移、管理员写操作、真实留存删除、SLS 资源创建或 LoongCollector 安装。

## 最新构建 HTTP 冒烟（2026-09-11）

以当前构建产物启动临时本地服务（端口 3102）并在验证后关闭：

- `/api/healthz`：200。
- `/api/metrics`：未认证 401。
- `/admin/statistics`、`/admin/audit-center`：匿名 307 跳转 `/admin/login`。
- `/api/admin/statistics/overview`、`/api/admin/audit-events`、`/api/admin/alerts`：匿名 401。

该冒烟只验证匿名边界与健康检查；管理员数据、告警写操作和生产 SLS 仍需审批后的专门演练。

## 合并与推送记录（2026-09-11）

- `codex/unified-control-centers` 已以非快进方式合并到 `main`，合并提交：`289e7127`。
- `git push origin main` 已成功；随后校验本地 `main` 与 `origin/main` 均为 `289e7127`。
- 已删除已合并的本地功能分支；其他工作树未改动，远端功能分支保留作历史参考。
- `pnpm release:context` 在合并后通过：候选分支为 `main`、工作树干净、远端备份已配置。

该合并提交只代表代码已进入远端 `main`，不代表当前增强已部署到生产；生产发布仍需从该 SHA 走独立审批与部署验证。
