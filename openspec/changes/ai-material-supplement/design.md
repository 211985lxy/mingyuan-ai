## Context

这次 change 不是在“补充证据素材”标题右侧再加一个按钮，而是要给包装层增加一条真正可信的 AI 辅助链路。

当前真实实现里有四个事实必须正视：

1. 包装层的素材输入仍然是手填 URL，这对小白用户根本不成立，系统也无法保留素材资产的来源与归属。
2. 工作台草稿目前只存 `structure/template/script/packagingTemplateId`，连 `materials` 和 `bgmUrl` 都没有进入恢复语义，更不用说 AI 建议结果。
3. 虽然仓库已经有真实 `/api/assets/upload-url` 和 `/api/assets`，但包装步骤还没有把这些能力整合成“直接上传/选择素材”的工作流。
4. Pexels 现有能力只覆盖“搜索 + 缓存 + OSS 转存”，还没有“基于脚本和画像做服务端搜索规划”的正式中台层。

如果不把这四个断层补齐，AI 一键补充只会创造更多隐患：

- 它会继续要求用户自己找 URL，导致手动模式在输入层就失败
- 它可能鼓励用户把 stock 图误用为真实案例或资质
- 它可能把临时 URL 偷偷带进生产计划，导致任务不可复现
- 它可能在用户改脚本后继续沿用旧素材，制造脏状态
- 它可能在模板差异完全不透明的情况下展示按钮，制造“系统很专业”的错觉

## Pressure Test

- **问题 1：如果系统把通用 Pexels 图自动塞到 `customer_case`、`qualification`、`before_after`，这是不是在帮助用户伪造证据？**
  不是可接受风险。自动建议必须限制在真实性安全的支持型角色，真实性敏感角色只能由用户手动提供真实素材。
- **问题 2：如果系统还要求小白用户自己去找图片、视频、BGM 的 URL，这条包装链路是不是从输入层就已经失败了？**
  是的。手动模式必须改成上传/选择资产，而不是继续暴露 URL 文本框。
- **问题 3：如果 AI 建议结果还是第三方临时 URL，就允许保存 production plan 或出视频，明天恢复草稿时还能复现同一条视频吗？**
  不能。Pexels 结果只能作为包装草稿预览，完成 OSS durable 转存后才有资格进入生产链路。
- **问题 4：如果用户已经改了结构、模板、brief 或文案，旧 AI 素材为什么还可信？**
  不可信。AI 建议必须参与工作台失效逻辑，并在必要时清空或标记待复核。
- **问题 5：如果包装模板差异不透明，或者素材来源无法追溯 `pexelsId` / `assetId` / 搜索词 / 转存状态，我们凭什么让用户相信这项能力真的可用？**
  没有理由。因此该能力至少必须建立在已选模板上下文上，并同时提供可见的来源元数据与能力说明，而不是只做一个看起来聪明的按钮。

## Goals / Non-Goals

**Goals:**

- 为包装层建立一条真实可用的 AI 素材建议链路，降低小白用户补证据素材的门槛
- 让包装层支持双模式输入：AI 自动补充，以及用户直接上传/选择图片、视频、BGM 资产
- 让建议结果成为可审阅、可删除、可重新生成、可恢复的包装草稿项
- 为 AI stock 素材建立真实性边界，避免把通用图库误用为真实证明
- 确保第三方素材只有在 durable 转存完成后才能进入 production plan 和任务提交
- 让脚本变化、模板变化与 AI 建议结果之间具有明确的失效语义

**Non-Goals:**

- 本 change 不引入视频类 stock 搜索，Phase 1 只支持图片建议
- 本 change 不做素材裁剪、编辑、配色或镜头级时间线编辑
- 本 change 不把所有闪剪模板都自动开放给 AI 补充，只先支持经过策展的“可承载证据素材”的模板
- 本 change 不把用户自有资产中心重构为全新的 DAM 系统
- 本 change 不改变最终 Shanjian 提交格式，生产链路仍然消费标准 `materials[]`

## Product Quality Bar

- AI 补充必须让小白用户觉得“有人在帮我补画面证据”，而不是“又要我调一个高级素材工具”。
- 手动模式必须让用户直接上传/选择自己的图片、视频、BGM，而不是把“找 URL”这件事外包给用户。
- 系统绝不能把通用 stock 伪装成真实资质、真实案例或真实 Before/After。
- 用户看到的每一条 AI 建议，都必须知道它来自哪里、现在是否已经 durable、能不能带进最终出视频。
- 重新生成、修改文案、恢复草稿后，系统状态必须诚实，不能把旧素材伪装成仍然有效。

## Acceptance Bar

- 用户在包装步骤选定支持素材的模板后，可以一键获得 3-15 张与脚本匹配的图片建议
- 用户可以在包装步骤直接上传或选择自己的图片、视频和 BGM，而不需要准备任何素材 URL
- 每张 AI 建议都带 `role`、`source`、`pexelsId`、搜索词、预览图和 OSS 转存状态
- `customer_case`、`qualification`、`before_after` 不会被 AI stock 自动填充
- 再次生成时，只替换既有 AI 建议，保留用户手动添加的素材
- 任何仍未完成 durable 转存的 AI 素材都会阻止 production plan 保存或最终任务提交

## Decisions

### D1: AI 素材建议属于包装层能力，不属于脚本生成层

**决定**

- 新能力以包装层为边界，围绕“如何为既有脚本补充可审阅的支持型画面”展开
- 该能力的上下文来自：
  - 已选 `Script`
  - 当前编辑中的脚本文本
  - 活跃 `IpProfile`
  - 已选包装模板及其素材承载能力
  - 当前包装草稿中的手动/AI 素材项

**为什么不是放进 `POST /api/scripts/generate`**

- 这是画面证据规划，不是文案生成
- 如果把素材建议塞回脚本接口，会继续混淆编剧层和包装层边界

### D2: 服务端拥有建议规划上下文，客户端不再上送“权威画像”

**决定**

- 新接口使用服务端拥有的真实实体作为主上下文，推荐请求体为：

```ts
interface PackagingMaterialSuggestionRequest {
  scriptId: string;
  scriptContentDraft?: string;
  packagingTemplateId: string;
  existingItems?: PackagingMaterialDraftItem[];
  maxCount?: number;
}
```

- 服务端自行加载活跃 `IpProfile`、包装模板能力、脚本内容和现有草稿项

**为什么不是继续让客户端传 `ipProfile`**

- 当前系统已经在脚本生成里确立了 server-owned prompt composition
- 画像属于可被客户端篡改的高价值上下文，不应由前端拼成权威输入

### D3: 包装素材输入改为“双模式资产输入”，不再让用户手填 URL

**决定**

- 包装层素材输入统一收口为两条真实路径：
  - `ai_pexels`: AI 自动补充通用支持型素材
  - `manual_upload` / `manual_library`: 用户上传或选择自己的图片、视频、BGM 资产
- 工作台不再把 freeform URL 文本框作为小白用户的主路径
- 手动上传通过真实 `/api/assets/upload-url` + `/api/assets` 完成，上传完成后立即回到当前包装草稿中可选
- BGM 遵守同样规则：用户上传或选择 `music` 资产，而不是输入 `audioUrl`

**为什么不是继续保留“会用的人可以填 URL”**

- 一旦文本框还在，团队就会自然地把它当作主路径，上传/选择会沦为补充功能
- 对目标用户来说，“找 URL”不是高级选项，而是直接的使用门槛

### D4: AI 建议结果是包装草稿项，不是最终 `MaterialAssignment`

**决定**

- 引入包装草稿项概念，用于区分“可预览/可重生”的 AI 建议与“可提交上游”的最终素材赋值
- 推荐草稿项字段至少包括：

```ts
interface PackagingMaterialDraftItem {
  role: string;
  type: "image" | "video";
  fileUrl: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  source: "manual_upload" | "manual_library" | "ai_pexels";
  assetId?: string;
  pexelsId?: number;
  searchQuery?: string;
  ossStatus?: "pending" | "transferring" | "ready" | "failed";
  manualOnly?: boolean;
}
```

- 只有手动资产项，或 `source="ai_pexels" && ossStatus="ready"` 的项，才允许下沉为最终 `MaterialAssignment`

**为什么不是继续复用 `{ role, fileUrl, type }`**

- 这个结构无法表达来源、可恢复状态、重新生成边界和 durable 校验
- 无法支持“替换 AI 项但保留手动项”的产品语义
- 无法表达手动素材与 BGM 的资产归属，导致上传能力无法沉淀为可复用资产

### D5: 自动建议仅覆盖真实性安全的支持型角色

**决定**

- Phase 1 自动建议仅覆盖真实性安全角色：
  - `product_detail`
  - `store_environment`
  - `process`
- 以下角色保持手动补充，AI 只允许给出“需要真实素材”的提醒，不自动填图：
  - `customer_case`
  - `qualification`
  - `before_after`

**为什么不是把所有角色都交给 LLM 自由分配**

- “案例”“资质”“前后对比”天然涉及真实性，generic stock 会直接伤害产品可信度和用户合规风险
- 对小白用户来说，系统默认给出来的就是“看起来可以用”的；因此边界必须由系统明确承担

### D6: AI 补充必须在已选包装模板上下文中工作，能力标签在 Phase 1 作为说明而不是硬阻断

**决定**

- 用户必须先选择包装模板，AI 建议才可用
- 若本地包装模板已有能力标签，例如 `evidence_insertions`，工作台应如实展示这些标签来解释预期素材行为
- Phase 1 不因为 capability 元数据暂时缺失而硬阻断 AI 补充；能力标签先承担“解释和引导”职责，而不是“生死开关”

**为什么不是继续把 capability gating 写成硬阻断**

- 当前模板同步数据的 `capabilities` 还是空数组，而现有 `getTemplateDetail` 也不提供足够稳定的素材位契约
- 如果把硬阻断建立在不完整元数据上，这个功能会在实现阶段直接被卡死
- 因此 Phase 1 先要求“必须先选模板”，并在有能力标签时展示说明；后续再把更强的 gating 建在完善后的模板元数据上

### D7: 搜索规划由“LLM 主路径 + 安全回退”组成，且只搜图片

**决定**

- 素材数量继续按脚本长度估算，但强调“补充覆盖”而非全覆盖
- 服务端先用 LLM 生成英文搜索计划，输入包括脚本、画像、模板能力、已有草稿项和目标数量
- 若 LLM 超时或返回不安全角色，允许使用基于脚本关键词与画像字段的 deterministic rescue path
- Phase 1 只调用 Pexels photo search，统一使用：
  - `mediaType=photo`
  - `orientation=landscape`
  - `locale=en-US`
  - `perPage=count * 2`

**为什么不是失败就直接报错**

- 这会让功能过于脆弱
- deterministic rescue path 仍然是基于真实输入和真实 Pexels 搜索，不属于 mock 或 fake fallback

### D8: Pexels 查询缓存必须纳入 suggestion 真实参数

**决定**

- Suggestion 使用的 query cache key 必须包含至少：
  - `query`
  - `mediaType`
  - `orientation`
  - `size`
  - `locale`
  - `page`
  - `perPage`

**为什么要单独强调**

- 现有 `computeQueryHash` 还没有纳入 `locale`
- 如果继续复用不完整缓存键，英文建议与其他上下文查询会发生脏缓存复用

### D9: 第三方 stock 素材在 durable 之前只能停留在“草稿预览态”

**决定**

- AI 建议接口可以返回 `pending/transferring` 的草稿项用于预览
- 但 `/api/production-plans` 和 `/api/tasks` 不得接受仍指向原始 Pexels URL 的 AI 项
- 只有 `ossStatus=ready` 时，`fileUrl` 才能作为最终生产素材进入 plan/task
- 用户手动上传/选择的素材和 BGM 通过受管资产 URL 进入生产链路，并在 packaging draft 与 production plan JSON 中保留 `assetId` 追踪

**为什么不是像搜索接口一样先返回原始 URL，提交时再说**

- 搜索页临时预览和生产链路是两回事
- 一旦进入生产计划，就必须保证可复现、可重试、可恢复

### D10: AI 建议必须参与工作台的失效、恢复和重新生成语义

**决定**

- 当用户变更以下上游输入时，AI 建议项必须清空或标记 stale：
  - `structureId`
  - `templateId`
  - brief inputs
  - hot topic
  - selected script
  - edited script
- 重新生成默认 `mode="replace_ai"`：删除旧 AI 项，保留手动项
- 工作台草稿恢复必须包含 AI/手动素材项及其状态元数据，不能只恢复 `packagingTemplateId`

**为什么不是继续沿用当前 localStorage 粗粒度草稿**

- 当前实现甚至没有保存 `materials` 和 `bgmUrl`
- AI 建议属于“有等待成本的包装成果”，不进入恢复语义就会让体验崩塌

## Risks / Trade-offs

- **[模板白名单会降低一键补充的覆盖率]** → 这是可接受的，先保证建议被用上，比对全部模板盲开更重要
- **[真实性边界会让 AI 看起来“不够聪明”]** → 这是有意为之，产品不能用“聪明”交换可信度
- **[durable 阻断会增加等待时间]** → 通过预览先行、状态透明和小批量转存降低体感成本
- **[引入草稿项元数据和资产选择会提高前端状态复杂度]** → 这是必要复杂度，否则无法同时支撑上传、AI、恢复与提交校验

## Migration Plan

1. 先在 OpenSpec 中冻结双模式输入、真实性边界、模板 gating 和 durable 约束
2. 定义包装草稿项、手动资产输入和 AI 建议接口契约，明确 manual_upload/manual_library/ai_pexels 的边界
3. 把真实资产上传/选择能力接入 `/create` 包装步骤，移除手填 URL 作为主路径
4. 扩展 Pexels 查询缓存与转存语义，让建议链路复用真实搜索和 durable 能力
5. 重构 `/create` 包装步骤，引入 AI 一键补充、透明状态、重新生成和草稿恢复
6. 收紧 `/api/production-plans` 与 `/api/tasks`，禁止非 durable AI 素材进入生产链路

## Open Questions

- `PackagingMaterialDraftItem` 是只存在于工作台前端状态，还是需要持久化到服务端草稿实体
- 包装模板的素材承载能力是通过显式运营字段维护，还是通过闪剪模板 detail 做半自动抽取
- 是否需要在 UI 显式展示“此角色必须上传真实素材，AI 不会代填”的空态卡片
