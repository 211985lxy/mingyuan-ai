# 统一审计中心运行手册

## 入口与边界

- 管理后台入口：`/admin/audit-center`。该页面只允许管理员访问。
- 旧入口 `/admin/logs`、`/admin/agents`、`/admin/usage` 仍保留书签兼容，会带着对应来源/类别筛选跳转到统一中心。
- 审计索引记录管理员、用户、AIM、智能体 API、代码智能体和服务器事件；原始 `AdminAuditLog`、`AimExecutionTrace`、`AgentApiCallLog` 仍是专业明细表。
- 索引写入失败默认只记录告警并继续业务请求。高风险管理员写入仍依赖原有必需的 `AdminAuditLog`。
- 不进入审计索引的内容：密码、密钥、Cookie、数据库 URL、完整提示词、客户全文和模型原始输入输出。

## 服务器配置

在应用运行环境中配置：

```dotenv
AUDIT_INGEST_SECRET=<至少 32 字符的随机值>
```

代码智能体或 Git 适配器通过同一个带时间戳 HMAC 的内部接口发送：

```text
POST /api/internal/audit-events
x-audit-timestamp: <Unix 秒>
x-audit-signature: HMAC-SHA256(<timestamp>.<body>, AUDIT_INGEST_SECRET)
```

生产环境不要把密钥写进 Git 跟踪文件、仓库脚本参数或日志输出。`AUDIT_INGEST_SECRET` 需要和服务器上的环境文件保持一致，并沿用现有 `0600` 权限。

## Claude/Codex/Cursor/Qoder/Trae 与 Git

所有适配器使用同一个脚本，不需要在每个工具里复制日志逻辑：

```bash
node scripts/audit-event.mjs start --tool codex --correlation-id <run-id>
node scripts/audit-event.mjs finish --tool codex --correlation-id <run-id>
node scripts/audit-event.mjs fail --tool codex --correlation-id <run-id>
node scripts/audit-event.mjs commit --tool codex
node scripts/audit-event.mjs flush
```

配置 `AUDIT_INGEST_URL` 和 `AUDIT_INGEST_SECRET` 后优先发送到服务器；未配置或网络失败时，事件会在仓库外加密排队：

```text
~/.mingyuan-audit/queue/
~/.mingyuan-audit/queue.key
```

目录权限为 `0700`，队列文件和密钥为 `0600`，队列内容使用 AES-256-GCM。适配器会用 `source + action + correlationId + gitSha/repositoryPath` 生成稳定幂等键。`start`、`finish`、`fail` 是智能体声明，`commit` 是 Git SHA 已确认事件；两者通过 `correlationId` 关联。

仓库的 `post-commit` hook 会自动提交一条 Git 已确认事件。没有配置远端时只排队，不会阻塞提交。未接入该适配器的任意外部工具无法保证自动产生事件，这是当前边界。

## 阿里云 ECS 查看原始日志

统一中心展示的是脱敏后的索引；服务器原始运行日志仍由 systemd journal 保留。在 ECS 上查看：

```bash
journalctl -u mingyuan-web.service --since today --no-pager
journalctl -u mingyuan-background-tasks.service --since today --no-pager
journalctl -u mingyuan-web.service -f
```

需要把某条服务器事件和原始日志对上时，使用审计详情里的 `occurredAt`、`requestId`、`traceId`、`correlationId` 或 `gitSha` 作为检索条件；不要把完整环境文件或密钥复制到日志中心。阿里云 SLS/LoongCollector 接入属于第二阶段，本阶段不改生产采集配置。

## 验收

本地适配器测试：

```bash
pnpm test:audit-event
```

应用侧仍需按发布门禁运行 Prisma 迁移完整性、类型检查、API 契约、组件测试和生产构建。生产部署必须围绕已验证的 Git SHA，并在部署后确认一个成功事件、一个幂等重放和一个失败事件。
