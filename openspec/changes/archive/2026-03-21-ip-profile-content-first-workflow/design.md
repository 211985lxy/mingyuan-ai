## Context

这次变更不是单纯改一个页面顺序，而是要把 ClipFlow 的核心对象从“数字人/视频任务”重新拉回“个人 IP / 内容策略 / 文案”。

当前代码暴露出 5 个系统级断层：

1. 前台核心页面仍依赖 `@/lib/mock/services`，真实后端没有接入到用户日常旅程。
2. `packages/shared` 中的运行时类型仍然是 mock 形状，和真实后端的 `plan`、`credits`、`coverUrl`、可选字段不一致。
3. `/create` 流程虽然 UI 上有模板和 AI 生成文案，但本质仍是“先文案文本、后数字人”，且依赖 mock 生成，不会真实入库。
4. 现有 `ContentTemplate` 体系已经存在，但当前前台没有真正使用 `/api/templates` 与真实模板数据完成创作。
5. `VideoDetail` 页面还在展示 fake 营销分析和 fake 发布建议，这类内容会制造“系统已完成”的错觉。

## Goals / Non-Goals

**Goals**

- 前台所有核心业务页面在运行时不再依赖 `lib/mock/*`
- 用户首次进入后台时先完成个人 IP 档案，且档案成为文案生成的强约束输入
- `/create` 流程改为模板优先、文案优先，再进入数字人和视频生成
- 文案生成必须真实入库，可追踪来源模板、来源 IP 档案、用户输入和最终选中稿
- 视频任务创建必须绑定已保存 Script，而不是只传裸 `scriptContent`
- 控制台首页与账户页只展示真实后端支持的数据，不再展示 mock 专属字段

**Non-Goals**

- 不重做运营侧模板管理后台 UI
- 不重新设计闪剪视频生成、Webhook、轮询等已完成后端能力
- 不引入多 IP 档案、多品牌工作区或团队协作
- 不实现营销分析、发布标题建议等新的 AI 能力；这类能力在后端未就绪前仅允许显示 `Coming Soon`

## Product Quality Bar

- 用户任何时候看到的数据都必须能在数据库或真实 API 中找到来源。
- 首次使用流程必须让用户感受到“有营销专家在带着做”，而不是在填后台字段。
- 文案是核心生产资产，不允许只存在于浏览器临时 state 中。
- 如果某项能力还没做完，界面必须诚实显示缺失或 `Coming Soon`，不能伪造成功态。

## Decisions

### D1: 每个用户先只维护一个 active IP Profile

**决定**: 新增 `IpProfile` 表，当前阶段每个用户只允许一个 active 档案，通过 `GET/PUT /api/ip-profile` 读写。

**字段建议**:
- `displayName`: 对外呈现的人设名
- `nickname`: 常用称呼
- `industry`: 所属行业
- `primaryOffer`: 主打产品/服务/能力
- `targetAudience`: 目标受众
- `ipTraits`: IP 特征与人格标签
- `toneOfVoice`: 希望的表达口吻
- `proofPoints`: 可信背书/案例/资历
- `callToAction`: 常用行动引导
- `isComplete`: 由服务端规则计算

**理由**: 用户当前需求是“先完成一个可持续使用的个人 IP 档案”，不是多品牌矩阵。单 active profile 可以最快把链路打通，也最容易做成强引导。

### D2: 新增独立 SPA `/ip-profile`，而不是弹窗或内嵌小卡片

**决定**: IP 档案使用独立路由承载，Dashboard 与 `/create` 在档案未完成时统一跳转或提示到该页面。

**理由**: 用户在这里做的不是一个辅助配置，而是在定义后续所有文案的底层素材。单独页面才能承载足够的专业引导和完成度反馈，也符合用户“先被带着做”的心理预期。

### D3: 前端统一引入真实 API client，不再让页面直接依赖 mock service

**决定**: 新增 `src/lib/api/*` 请求层，集中处理 JWT 持久化、Authorization 注入、401 清理、分页 DTO 转换。前台 app route 不再直接导入 `@/lib/mock/services`。

**理由**: 当前 mock service 已经从“前期占位”演变成“前台主运行时”，继续迭代只会把假链路越堆越厚。真实 API client 是这次重构的基础设施，不先做这一层，后续每个页面都会各自重复造轮子。

### D4: 认证沿用现有 Bearer JWT 契约，前端负责持久化与刷新校验

**决定**: 不重做用户鉴权协议。前端使用 `/api/auth/login`、`/api/auth/register` 返回的 token 进行持久化，并通过 `/api/auth/me` 做启动校验与用户信息同步。

**理由**: 后端认证已经完成；本次目标是把前台接到真实系统，而不是再开一个 cookie/session 改造项目。先让前台遵守现有契约，后续若要升级为 HttpOnly Cookie，可再单开 change。

### D5: 复用 `ContentTemplate`，但语义升级为“内容模板蓝图”

**决定**: 保留现有 `ContentTemplate` 表，不再把它视为“直接渲染成完整脚本的字符串模板”。其中：
- `variables` 作为 brief 表单 schema
- `scriptTemplate` 作为服务端 prompt blueprint
- `hookType` / `contentType` / `tags` 继续承担运营筛选和展示作用

**理由**: 现有模板后台、种子数据和筛选 API 已经存在，重起一个模板模型只会制造双轨。真正需要变的是模板的使用方式，从“纯替换字符串”升级为“指导 LLM 生成内容”。

### D6: 文案生成采用“生成批次 + Script 候选稿”双层持久化

**决定**:
- 新增 `ContentGenerationRun`，保存一次生成动作的模板、档案、输入快照、可选热点上下文
- 扩展 `Script`，保存 `generationRunId`、`ipProfileId`、`sourceTemplateId`、`status`

**建议状态**:
- `candidate`
- `selected`
- `discarded`

**理由**: 文案是核心资产，不能只在前端 state 中选来选去。后续复盘模板效果、查看用户选中过什么、允许继续编辑，都需要真实的生成批次和候选稿。

### D7: `/api/scripts/generate` 成为文案生成的唯一入口

**决定**: 新增受保护的 `POST /api/scripts/generate`，请求参数包含 `templateId`、`inputs`、可选 `hotTopic`。服务端负责读取 IP 档案、模板蓝图和用户输入，组装 prompt，调用 LLM，并写入生成批次和候选稿。

**理由**: 文案生成需要同时做校验、prompt 组装、持久化和追踪，继续把逻辑挂在 `templates/[id]/generate` 这种“纯模板渲染”接口上会让语义越来越混乱。

### D8: 视频任务改为从 `scriptId` 发起，而不是从裸 `scriptContent` 发起

**决定**: `POST /api/tasks` 新增 `scriptId` 作为主输入。服务端根据 Script 记录写入 `VideoTask.scriptId` 和 `VideoTask.scriptContent` 快照；若用户在前台编辑过文案，必须先更新 Script，再发起任务。

**理由**: 这能把“模板 → 生成稿 → 选中稿 → 成片”串成真正可追踪的一条链。单独传 `scriptContent` 会让前期所有建模价值在提交任务的一瞬间断掉。

### D9: Dashboard 与 Account 的指标切换为真实后端口径

**决定**: 前台不再依赖 `dailyLimit`、`videosCreatedToday`、`thumbnailUrl` 这类 mock 字段。改为展示真实后端已有字段和可计算指标：
- `plan`
- `credits`
- 当前 processing task 数
- 最近视频列表（使用 `coverUrl`）

**理由**: 这次重构要解决的是“真实系统和前台错层”，不是再补一套新的 fake 指标。前台必须反映真实业务口径，否则用户会被错误预期误导。

### D10: 未完成的后端能力只能显示真实缺口，不能再用 mock 补体验

**决定**: `VideoDetail` 中 fake 营销分析、fake 发布标题/描述建议等能力，若后端没有对应 API，则前台显示 `Coming Soon` 或隐藏该模块，不再通过 mock service 生成假数据。

**理由**: 伪运行时能力会伤害判断。团队会误以为功能已完成，用户也会被假反馈误导，最终让产品进入一种“表面很丰满、底层很空心”的状态。

## Architecture Shape

### New / Updated Data Models

- `IpProfile`
- `ContentGenerationRun`
- `Script` 增补：
  - `generationRunId`
  - `ipProfileId`
  - `status`
  - 保留 `sourceTemplateId`

### New / Updated APIs

- `GET /api/ip-profile`
- `PUT /api/ip-profile`
- `POST /api/scripts/generate`
- `PATCH /api/scripts/[id]`
- `POST /api/tasks` 支持 `scriptId`

### Frontend Runtime

- `src/lib/api/client.ts`: fetch wrapper + token persistence + auth header
- `src/lib/auth-storage.ts`: token/user 读写与清理
- 页面全面切换到真实 API：
  - `(auth)/login`
  - `(auth)/register`
  - `(dashboard)/layout`
  - `(dashboard)/page`
  - `(dashboard)/create`
  - `(dashboard)/assets`
  - `(dashboard)/videos`
  - `(dashboard)/videos/[id]`
  - `(dashboard)/account`
  - 新增 `(dashboard)/ip-profile`

## Risks / Trade-offs

- **LLM 集成尚未落地**: 本次会把契约和持久化设计清楚，但实际 provider 接入仍可能需要单独环境变量和限流策略。缓解：通过 `lib/script-generator.ts` 做 provider 抽象。
- **现有模板数据需要迁移**: 旧模板更像“静态脚本骨架”，切换到 prompt blueprint 后需要运营重写首批模板。缓解：先迁移高频模板，保留管理后台发布能力不变。
- **前台字段大面积调整**: `shared` 类型、页面组件和 API 响应口径都要改。缓解：先收敛 DTO，再逐页替换。
- **资产页真实化会暴露更多表单复杂度**: 当前 UI 只收 `name`，真实 API 需要 cloneType、上传地址、授权视频和授权文案。缓解：在资产页拆分“极速克隆 / 专业克隆 / 图生数字人”分支表单，避免一个表单塞满。
- **用户熟悉的“每日次数”文案会变化**: 后端真实口径是 credits + 并发，不是 daily limit。缓解：前台改为更真实的“剩余 credits / 当前生成中任务数”，避免继续使用伪口径。
