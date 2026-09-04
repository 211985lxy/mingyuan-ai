# 经营归因强制点实施计划（WP-A 发布作品键 + WP-B 线索快登）

> 状态：实施中 · 日期：2026-09-03 · 分支：`feat/attribution-closure-wpab`
> 上游计划：《明动AIM-经营归因闭环升级计划-2026-09-03》（工作区根目录）第四、五节
> 红线：不加内容生产新功能；不自动发布、不碰平台 API；零假数据——缺省记 unknown / 显式未发布，不猜测补齐。

## 0. 勘察结论（含一个关键回归）

- 登记发布链路：`WorkflowRecordDialog`（`publish` 模式）→ `use-aim-workflow-records.savePublishRecord` → `PATCH /api/aim/history/[id]` → `parseAimHistoryUpdate` → `assertWorkflowTransition`。状态机目前进入 `published` 只要求 `publishPlatform`，**不要求作品链接**（`workflow-status.ts:118-123`）。
- **回归**：`90bb0b0d`（内容台收束三目的）移除了交付卡片的动作按钮行，但 `AimDeliverableBubble` 仍保留 `onOpenDecision / onOpenPublish / onOpenRetro` 死 props——登记发布 / 发布前判断 / 填写复盘对话框当前 **UI 不可达**。两个强制点若无入口则无从强制，故本工作包含"恢复最小登记入口"。
  - 有意不恢复：状态 Select、nextActions 主按钮、更多操作下拉（收束重构的精简意图，且状态推进已由内容包流程自动承担）；仅恢复三个登记入口并新增第四个"登记线索"。

## 1. WP-A：发布登记必挂作品键（强制点①）

### 目标

进入 `published` 状态时，`发布平台 + 作品链接或作品 ID` 必填；服务端与客户端双重校验。确实未发布的内容留在 `ready_to_publish`，不算失败、不造假。

### 改动清单

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/lib/aim/workflow-status.ts` | `assertWorkflowTransition`：`to === "published"` 时要求有效 `publishUrl`（链接或作品 ID，trim 非空）；错误文案"登记已发布时必须填写作品链接或作品 ID" |
| `apps/web/src/lib/aim/services/history-update.ts` | `parseAimHistoryUpdate` options 增加 `existingPublishUrl`；URL 生效值 = 本次传入 ?? 库内已存（与 platform 复用语义一致） |
| `apps/web/src/app/api/aim/history/[id]/route.ts` | `findFirst` select 增加 `publishUrl` 并传入 options |
| `apps/web/src/hooks/use-aim-workflow-records.ts` | `savePublishRecord`：`publishUrl` 为空直接抛错，不发起请求 |
| `apps/web/src/components/aim/workflow-record-dialog.tsx` | `PublishFields` 链接 placeholder 改为必填说明（"用于经营归因"）；`DIALOG_COPY.publish` 描述同步 |
| `apps/web/src/components/aim/aim-deliverable-bubble.tsx` | 恢复最小登记入口行：发布前判断 / 登记发布 / 填写复盘（+WP-B 登记线索） |

### 不做

- 不做 `externalPostKey` 落库与规范化派生：`publishUrl` 必填后作品键可随时从链接派生，但派生规则依赖 WP-C P0 真实链接样本（抖音/小红书 URL 结构），P0 前实现属臆猜接口。列为 WP-C 后续工作包。
- 不为存量已发布数据补作品键（沿用现状，复盘时空值≠0）。
- 不改 `handleMarkStatus` 快捷路径语义（服务端校验已覆盖：无平台/无 URL 的 published 请求会被拒绝并 toast）。

### 验收

- 单测：状态机 published 无 URL 拒绝 / 有 URL 通过 / 库内已存 URL 复用通过；history-update 透传 existingPublishUrl；savePublishRecord 空 URL 不发请求。
- 回归：`aim-workflow-status.test.ts`、`aim-history-update.test.ts`、`aim-workflow-records.test.ts`、`aim-workflow-dialogs.test.ts` 全绿。
- UI 冒烟：交付卡片出现登记入口；登记发布不填链接无法保存；填链接后状态推进 published。

## 2. WP-B：线索快登挂来源（强制点②）

### 目标

私域加微 / 进线 / 预约发生时，用户在对应内容卡片一键登记「这条线索来自这条内容」，写 `OutcomeAttribution`（`explicitLink: true` → explicit/high）。缺省即不登记（unknown 由运营侧兜底），禁止猜测归因。

### 改动清单

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/app/api/aim/lead-attributions/route.ts` | 新增 POST：auth → 校验 `generationId` 归属与 `externalLeadId` 非空 → `upsertOutcomeAttribution({ explicitLink: true, ... }, createPrismaOutcomeAttributionStore())`；`AttributionConflictError` → 409 原文案 |
| `apps/web/src/lib/api/lead-attribution.ts` | 新增浏览器薄客户端 `registerAimLeadAttribution`（仿 `lib/api/creator-metrics.ts`） |
| `apps/web/src/components/aim/workflow-record-dialog.tsx` | 新增 `lead` 模式与 `LeadFields`：线索标识（必填）+ 成交记录编号（选填）+ 回款记录编号（选填）；说明"来源自动挂到本条内容，不确定来源就不要挂" |
| `apps/web/src/hooks/use-aim-workflow-records.ts` | `leadForm` 状态 + `saveLeadRecord`（调 API，成功 toast"已登记线索归因"）+ `submitRecordDialog` 分支 + reset |
| `apps/web/src/components/aim/aim-message-stream.tsx` | `onOpenLead` 透传（`openRecordDialog(message.id, "lead")`） |
| `apps/web/src/components/aim/aim-deliverable-bubble.tsx` | 入口行加"登记线索"按钮 |

### 不做

- 不建 Lead / Deal / Payment CRM 实体（守 WP-3 外部 ID 投影原则）。
- 不做线索列表页 / 看板（运营核对走既有 admin 路由）。
- 不自动从聊天记录推断来源（禁猜测归因）。

### 验收

- 单测：route 测试（归属校验 404 / 空线索标识 400 / 成功 upsert explicit / 冲突 409）；hook 空标识抛错；dialog copy 含 lead。
- 边界：`externalLeadId` 全局唯一冲突、跨用户绑定均返回原错误文案，不静默改写。

## 3. 交付门闩

`pnpm --filter web typecheck` → `pnpm --filter web test:unit`（相关文件）→ `pnpm --filter web arch:size`。涉及 UI 与路由，须过生产构建（`pnpm --filter web build`，如耗时则至少 typecheck+unit 全绿后说明）。

## 4. 已知偏离与移交项

- WP-A 计划中的 `externalPostKey` 落库推迟到 WP-C P0 之后（理由见上），在总计划文档中同步登记。
- 登记入口回归的完整恢复（nextActions / 状态 Select 是否需回填）超出本工作包边界，移交产品决策。
