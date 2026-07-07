## Why

当前系统的核心链路已经发生错位：后端真实 API、数据库和任务编排基本齐了，但前台登录、注册、Dashboard、资产、创作、视频库、账户等核心页面仍然依赖 `lib/mock/services`。这会让用户旅程、数据入库、任务状态和真实系统完全脱节。

与此同时，[docs/22.md](/Users/ethan/Workspace/z/clipflow/docs/22.md) 明确提出新的产品重心应该是“先建立个人 IP 档案，再围绕模板生成文案，最后选择数字人出视频”。如果继续沿用当前“先选数字人，再补文案”的流程，系统会把错误的主对象固化下来，后续越做越难扭转。

## What Changes

- 新增个人 IP 档案系统与独立 SPA，首次进入控制台时优先引导用户完成建档
- 新增前台真实 API 运行时：注册、登录、鉴权、Dashboard、资产、视频、账户、创作页全部切换到 `/api/*`，禁止运行时依赖 `lib/mock/*`
- 重构创作流程为文案优先：选择内容模板 → 填写 brief → AI 生成候选文案 → 选择/编辑文案 → 选择数字人 → 生成视频
- 新增真实文案生成后端，使用 IP 档案、运营模板和用户输入组装 LLM prompt，并持久化生成批次与候选文案
- 更新视频任务创建链路，支持从已保存的 Script 记录发起生成，保留模板、IP 档案、文案和视频任务之间的可追踪关系
- 更新 Dashboard / Account 的指标口径，改为展示真实后端支持的数据（plan、credits、processing tasks、recent videos），移除 mock 专属字段依赖
- 移除前台对 fake 营销分析、fake 发布建议、fake 上传成功等伪运行时能力的依赖；若后端未提供能力，前台必须显示真实空态或 `Coming Soon`

## Capabilities

### New Capabilities

- `frontend-real-api-runtime`: 前台认证、Dashboard、资产、视频、账户和创作页全部通过真实 API 运行，前端鉴权状态可持久化，运行时不再依赖 mock service
- `ip-profile-system`: 用户可创建、编辑和读取个人 IP 档案；系统会校验档案完成度，并在文案生成阶段注入档案信息
- `content-generation-pipeline`: 文案生成基于运营模板和 IP 档案完成，服务端负责 prompt 组装、LLM 调用、候选文案持久化和选中稿管理
- `content-first-journey`: 控制台首页和 `/create` 页面切换到文案优先流程，用专业引导驱动用户先完成建档与文案选择，再进入数字人和视频生成

### Modified Capabilities

_None._

## Impact

- **前端页面**: `apps/web/src/app/(auth)/*`, `apps/web/src/app/(dashboard)/*` 全部需要改为真实 API 数据流
- **前端运行时**: 新增 API client、JWT 持久化、401 清理与重定向机制；`useAuthStore`、`AuthGuard`、共享 DTO 需要重构
- **数据库**: 新增 `IpProfile`、`ContentGenerationRun`，扩展 `Script` 以保存生成批次、来源模板和档案关联
- **后端 API**: 新增 `/api/ip-profile`、`/api/scripts/generate`、`/api/scripts/[id]`；更新 `/api/tasks` 以支持 `scriptId`
- **模板系统**: 已发布 `ContentTemplate` 将从“直接渲染脚本”转向“驱动 LLM 生成的内容模板蓝图”
- **测试**: 需要新增从注册到建档、选模板、生成文案、选数字人、发起视频任务的完整 E2E 覆盖
