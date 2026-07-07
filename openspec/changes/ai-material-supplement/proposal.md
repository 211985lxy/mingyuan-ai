## Why

当前 `/create` 的包装层虽然已经有“补充证据素材”的入口，但真实实现仍然要求用户逐条手填 OSS URL。对于面向短视频小白的小企业主，这个动作既不专业，也不顺手，结果往往是直接跳过素材补充，最终产物退化成“数字人口播 + 基础包装”，说服力明显不足。

独立的 `SPEC-ai-material-supplement.md` 抓住了正确方向，但从系统视角还缺了五个上线前必须补齐的约束：第一，小白用户没有义务自己去找图片、视频、BGM 的 URL，因此包装层不能再把“填 URL”当主输入方式；第二，AI 不能把通用 stock 图伪装成“客户案例”“资质证明”这类真实性敏感证据；第三，AI 补充必须建立在已选包装模板上下文上，但不能被当前尚不完整的模板 capability 元数据卡死；第四，来自 Pexels 的临时 URL 不能直接进入 production plan 或视频任务；第五，AI 补充结果必须参与工作台的失效、恢复和重新生成语义，而不是做成一次性按钮。

如果这些约束不先写进 OpenSpec，这个功能很容易沦为“看起来很聪明，但会制造假证据、脏状态和不可复现任务”的伪能力。

## What Changes

- 新增包装层 AI 素材建议能力：根据已选脚本、当前脚本文本、活跃 IP 画像和包装模板上下文，自动生成可审阅的 Pexels 图片建议
- 将包装层素材输入升级为双模式：AI 自动补充，以及用户自己上传/选择图片、视频、BGM 资产，移除手填 URL 作为主路径
- 将 AI 建议素材定义为带来源追踪和转存状态的包装草稿项，而不是直接等同于最终 `MaterialAssignment`
- 为 AI stock 素材建立真实性边界：自动补充仅覆盖通用支持型角色，`customer_case`、`qualification`、`before_after` 等真实性敏感角色保持手动补充
- 要求第三方 stock 素材完成 OSS durable 转存后，才能进入 production plan 和最终视频提交
- 扩展 `/create` 包装层工作台：增加一键补充、透明来源标签、重新生成、失效提醒、草稿恢复和提交阻断语义

## Capabilities

### New Capabilities

- `packaging-material-suggestions`: 定义包装层 AI 素材建议的服务端规划、Pexels 搜索、来源追踪、真实性边界和重新生成契约

### Modified Capabilities

- `video-packaging-pipeline`: 包装素材和 BGM 输入改为“AI 补充 + 上传/选择资产”的双模式契约，不再依赖手填 URL
- `video-creation-workbench`: 包装步骤需要接入 AI 一键补充、草稿恢复、失效提示和提交前 durable 校验
- `media-delivery-durability`: 第三方 stock 素材必须完成自有存储转存后才能进入生产链路

## Impact

- **前端工作台**: `apps/web/src/app/(dashboard)/create/page.tsx` 需要从“手填素材 URL”升级为“AI 建议 + 上传/选择自有资产”的双模式包装草稿体验
- **资产 API 集成**: 需要复用真实 `/api/assets/upload-url`、`/api/assets`、资产列表接口，让用户在包装步骤直接上传/选择图片、视频和 BGM
- **新 API**: 新增包装层素材建议接口，服务端从真实 `Script`、`IpProfile` 和包装模板能力生成建议，而不是信任客户端拼好的画像上下文
- **Pexels 能力层**: 需要复用并扩展现有 `/api/pexels/search`、`/api/pexels/media/[pexelsId]`、`lib/pexels.ts`、`lib/pexels-oss.ts` 的缓存、查询参数和转存语义
- **生产链路**: `/api/production-plans` 和 `/api/tasks` 需要拒绝仍处于 `pending/transferring/failed` 的 AI 建议素材，禁止回落为原始 Pexels URL
- **类型与契约**: 包装草稿项需要具备 `source`、`assetId`、`pexelsId`、`searchQuery`、`thumbnailUrl`、`ossStatus` 等来源与状态元数据，不能继续只用 `{ role, fileUrl, type }`
