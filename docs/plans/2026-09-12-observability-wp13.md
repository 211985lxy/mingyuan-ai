# WP-1.3 观测补齐

> 状态：代码完成 · 日期：2026-09-12 · 分支：`feat/wp11-outcome-autofetch`（与 WP-1.1/1.2 同分支，尚未拆 PR）
> 上游：《明动AIM-AI原生分批升级计划-2026-09-12》批次 1 / WP-1.3
> 红线：DSN 未配时 SDK 关闭，不往外发；不接 OpenTelemetry；不录 session replay；不带用户个人信息；不新增 Sentry 示例页或 tunnel API。

## 1. 改了什么

- 接入 `@sentry/nextjs`：服务端 `sentry.server.config.ts`、Edge `sentry.edge.config.ts`、浏览器 `instrumentation-client.ts`，由 `instrumentation.ts` 按运行时加载。
- 出错页 `global-error.tsx` 仍是纯静态边界（不碰 DB / next-intl），只多了一句把异常交给 Sentry；按钮改回品牌朱砂，保留原来的「重试」和错误编号。
- `createRequestLogger` 把当前 `requestId` 打到 Sentry tag，方便和 pino 日志对上号。
- `env.ts` 登记 7 个可选 Sentry 变量（`SENTRY_*` 6 个 + `NEXT_PUBLIC_SENTRY_DSN`）以及 Next 注入的 `NEXT_RUNTIME`（instrumentation 用来区分 node/edge），schema 与 runtimeEnv 成对；legacy 行数上限 542 → 560。
- unit 覆盖率：`@vitest/coverage-v8`，脚本 `test:coverage`；CI `repository-guardrails.yml` 跑覆盖率并上传 `apps/web/coverage/`，**只建基线不设门槛**。

## 2. 不做

- 不接 OTel。
- 不打开 session replay，`sendDefaultPii: false`。
- 不建 `/sentry-example-page`，不加 `tunnelRoute`（会多一个 API 面，碰到 api-inventory）。
- 本次不配生产 DSN、不宣称「生产错误可见」。那是放量验收，要等密钥进生产环境。
- 不提交、不发 PR（等你说）。

## 3. 验收（代码层）

- 单测：`sentry-request-trace.test.ts`（requestId 打 tag；无 DSN 时 enabled=false）。
- `pnpm --filter web test:unit` 3840 通过；`test:coverage` 同样通过。本地这次覆盖率：语句 45.42%、分支 40.46%、函数 42.67%、行 47.04%。这是基线数字，CI artifact 才是正本，**不设门槛**。
- `env:check`、`typecheck`、`arch:size` 通过。
- 放量级验收（生产首个真实错误在 Sentry 可见，带 requestId）要等 DSN 进生产后另记。

## 4. 回滚

去掉 `withSentryConfig` 包装、删掉 instrumentation 三件套即可。DSN 留空本身就是开关：不配密钥等于没接。
