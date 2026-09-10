# ECS Alibaba SLS / LoongCollector Canary Checklist

## 目标资源

- ECS OS：Alibaba Cloud Linux 3（OpenAnolis）
- 服务：`mingyuan-web.service`
- SLS Project：`mingyuan-prod-observability`
- Logstore：`app-journal`、`nginx-access`
- 原始日志留存：30 天

## 安装前

1. 在阿里云控制台确认地域、Project/Logstore 名称可用性和最小权限。
2. 确认 LoongCollector 当前未安装或未运行，记录版本和回滚包来源。
3. 确认 journald 持久化目录、Nginx access/error 路径与磁盘余量。
4. 明确禁止采集 `/etc/mingyuan.env`、密钥、Cookie、Authorization、聊天正文和知识正文。

## Canary 步骤

1. 只绑定 `mingyuan-web.service` 的 journald 输入到 `app-journal`。
2. 解析 `requestId`、`correlationId`、`traceId`、`component`、`status`、`duration`、`releaseSha`。
3. 生成一条测试请求，在 SLS 中按 `correlationId` 和 ±5 分钟时间窗查询。
4. 确认应用日志、请求状态、耗时和 release SHA 可检索，且敏感值已经脱敏。
5. 人工制造一次失败请求，确认 error 日志进入 SLS，并与后台告警 fingerprint 可关联。
6. 观察采集延迟 10 分钟；无丢失、无重复风暴后，再扩展到后台 timer/service 与 Nginx。

## 验收与回滚

- 采集延迟低于 10 分钟，字段解析率 100%（对存在字段而言）。
- SLS 控制台链接由服务端生成，配置不完整时页面不显示半有效链接。
- 任何敏感内容命中即停止扩展，先删除 SLS 测试数据并修正规则。
- 采集器异常时停用采集配置并恢复原 journald 运行，不修改应用数据库和专用审计日志。
- 全量扩展前保存 LoongCollector 配置、SLS 资源 ID、版本、验证截图和审批单号。
