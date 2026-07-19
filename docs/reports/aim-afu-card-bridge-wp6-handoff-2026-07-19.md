# AIM × Afu 卡片桥接 WP-6 交接

日期：2026-07-19  
分支：`feat/aim-afu-card-bridge`

## 已完成

- 新增 `POST /api/integrations/feishu/work-items/from-card`：接收 Afu 的 `topicId`、标题、工作流、AIM 项目 ID、输入摘要和可选排期，将卡片幂等投影到 `AIM经营事项`。
- 新增 `GET /api/integrations/feishu/work-items/by-card/[topicId]`：按稳定的 Markdown `topicId` 查询 Base 侧状态、工作流、结果和卡片映射字段。
- 新增真实 Base 适配端口，复用 `lark-base-tool.ts` 的 `+record-list`、`+record-upsert`，不新建飞书客户端、不新建状态机。
- 只由 Markdown 卡片更新标题、输入摘要、来源路径、计划时间和日历事件 ID；Base 的状态、负责人和结果字段仍由 AIM 经营流程掌握。
- 同一 `topicId` 的工作流或 AIM 项目 ID发生冲突时返回 409，避免静默覆盖。

## 外部契约

真实表必须包含这些字段：`Markdown卡片ID`、`Markdown卡片路径`、`计划开始`、`计划结束`、`日历事件ID`；这些字段已在 2026-07-19 的 WP-0 联调中核对并创建。运行时仍必须通过 `LARK_BASE_TOKEN`、`LARK_WORK_ITEM_TABLE_ID`、`LARK_CLI_PATH` 配置，不在代码中写入 token、表 ID或日历 ID。

## 验证

- `vitest`：桥接测试 4/4；既有 AIM 领域测试 30/30。
- `typecheck`：通过（工作树使用本地生成的 Prisma 类型目录）。
- `arch:check`：通过。
- `longfn:check`：87 ≤ 基线 112。
- ESLint：新增文件 0 error；`lark-base-tool.ts` 仅保留既存文件长度 warning。

## 未执行

本包没有创建或修改真实 Base 业务记录，也没有创建日历事件。真实端到端联调需由运行环境注入飞书配置，并用一张明确授权的 Afu 测试卡片执行。
