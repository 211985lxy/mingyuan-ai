## Why

当前 `/create` 已经具备三层雏形，但整体仍然是“拼起来能跑”的状态，不是一个真正完整的创作工作台。最明显的断层有五个：结构库仍带强行业属性、表达模板仍按行业切卡、结构对包装层的影响没有正式契约、模板推荐还停留在隐含逻辑、Pexels/BGM 的真实能力边界没有被写进产品规范。

现在正是补齐这轮升级的时间点：Pexels 图片/视频素材已经接通，足以承接 AI 包装辅助；而 BGM 自动控制还没有真实 API，更需要在规范层明确“先不要假装有”。这次 change 要把 create 流程升级成一套能长期扩展的正式规范，而不是继续堆局部修补。

## What Changes

- 用 10 套无行业限制的通用视频结构替换当前带行业倾向的结构心智，并把结构正式拆成脚本蓝图和包装意图两部分。
- 用 10-20 套无行业限制的通用表达模板替换当前按行业切分的内容模板卡片，让行业身份只留在 `IP` 层，视频事实回归 brief 输入。
- 引入包装模板推荐能力：基于结构、脚本和模板能力做推荐排序、适配理由说明和默认参数预设，而不是默认硬过滤模板。
- 升级包装层为双模式素材链路：AI 通过 Pexels 补充支持型图片/视频素材，用户仍可手动上传或从素材库选择图片/视频/BGM 资产。
- 明确 BGM 当前阶段是手动能力，不允许在没有真实上游接口的情况下假装支持自动配乐或自动控制。
- 将 `/create` 固化为 4 个可见阶段的虚拟人口播工作台，并补齐失效规则、推荐解释、恢复语义和最终 production summary。
- 将当前主链路的产品域明确为 `virtualman`，对 `realman`、`mixcut` 等非当前域类型进行诚实隐藏或阻断，而不是伪支持。

## Capabilities

### New Capabilities
- `video-structure-system`: 定义去行业化结构库、结构蓝图和结构向包装层输出的包装意图
- `content-template-system`: 定义去行业化表达模板库、表达蓝图和 reusable brief schema
- `video-template-recommendation`: 定义包装模板推荐、适配理由和参数预设
- `video-packaging-pipeline`: 定义双模式素材/BGM 输入、Pexels 支持型素材辅助和生产计划落库
- `video-creation-workbench`: 定义 4 阶段 create 工作台、失效规则、恢复语义和总结页

### Modified Capabilities
- `content-first-journey`: `/create` 的用户旅程升级为以通用结构、通用表达模板、推荐包装和虚拟人口播主域为核心的正式工作台
- `content-generation-pipeline`: 文案生成改为消费 richer structure blueprint 和 expression blueprint，并把血缘和质量门槛写进正式规范

## Impact

- Affected frontend: `/create` workbench, expression template cards, brief form rendering, production summary, stale-state UX
- Affected backend APIs: `/api/structures`, `/api/scripts/generate`, `/api/templates`, `/api/production-plans`, packaging/material recommendation endpoints
- Affected data/contracts: structure seed data, expression template seed data, structure blueprint fields, expression blueprint fields, packaging intent fields, template capability normalization, production plan snapshots
- External dependencies: Pexels image/video search and durable transfer, Shanjian template metadata; no automatic BGM provider is introduced in this phase
