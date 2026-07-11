# ADR-001：AIM Harness 作为唯一执行内核

- 状态：已采用
- 日期：2026-07-11

## 决策

AIM 保持模块化单体，不引入第二套 Agent 框架。`executeAimRun` 和 `streamAimRun` 是唯一正式执行入口。

每次运行按固定方向依赖：

```text
Route -> Harness Runtime -> Request/Context Assembly -> Domain Executor
      -> Agent -> Model Port -> Persistence/Quality/Trace -> Response
```

- Planner 唯一次确定 `runtimeTask`、`conversationMode`、`knowledgeStrategy` 和 `modelPolicy`。
- Route 只做鉴权、输入校验、入口自身事务和响应序列化。
- Agent 不得直接读取 Prisma 或模型 Router；它们通过持久化与模型端口执行。
- 快照、降级、质检和 Trace 属于 Harness 生命周期，不在各入口重复实现。

## 原因

现有 AIM 已有客户项目、知识库、IP Wiki、七个专业智能体和业务结果链。重建框架会产生两套任务、记忆、工具和追踪协议。薄 Harness 收口可靠性，保留现有业务真源。

## 后果

- 新入口或能力必须经过 Runtime，架构守卫在 CI 中阻止绕行。
- 旧 `runAimGenerate` / `runAimChat` / `planAimChatStream` 不再保留。
- 对外 HTTP 契约和数据模型保持兼容。
- `aim-agent-handlers.ts` 作为历史过渡文件只能缩小，不得超过当前行数预算；新 Agent 必须放入独立模块。

## 退出策略

每个迁移阶段保持独立 Commit，可回退当前阶段。不保留长期双运行时，避免新旧逻辑漂移。
