## Why

ClipFlow 的视频生成链路已经具备从脚本到成片的主路径，但当前实现把“能跑通”建立在多个脆弱前提上：任务预占位与上游受理并非一致提交，production plan 没有可靠的保留/释放语义，包装素材对上游服务的可达性没有被正式保证，结果转存失败会静默降级为 24 小时临时链接，前端高频轮询还会反向驱动上游状态推进。对于一条承载交易和用户信任的核心链路，这些都不属于“以后优化”的范畴，而是上线前必须收口的基础能力。

从产品架构角度，这次 change 也不是单纯修 bug。ClipFlow 面向的是短视频小白用户，系统在工作台里已经有较完整的工作台旅程和页面结构；本次 change 不重做这些界面，而是补齐它们背后的可信底座。如果底层任务状态、production plan 使用语义、素材可达性和结果交付都不可靠，任何上层引导都会失真。因此现在需要把视频生成工作流从“功能可用”升级到“结果可信、状态可信、交付可信”。

## What Changes

- 新增视频任务可靠性能力，统一定义任务提交、预占位、失败补偿、终态收敛和降级状态的业务契约
- 新增媒资交付持久化能力，统一定义包装素材/BGM 对上游可达、生成结果对用户可持久访问的交付契约
- 调整任务查询与恢复通道的运行时契约，让页面继续只调用后端 API，但后端读接口不再隐式推动上游状态
- 调整 API 响应契约，显式返回 `durable` / `degraded` 交付信息，供现有页面按需消费

## Capabilities

### New Capabilities

- `video-task-reliability`: 视频任务提交、结算、终态推进、失败补偿和降级状态的统一契约
- `media-delivery-durability`: 包装素材/BGM 的上游可达性和生成结果的持久化转存契约

## Impact

- **核心 API**: `/api/tasks`, `/api/tasks/[id]`, `/api/webhook/shanjian`, `/api/production-plans`, `/api/assets/upload-url`, `/api/assets`
- **核心服务模块**: `apps/web/src/lib/rate-limit.ts`, `apps/web/src/lib/oss.ts`, `apps/web/src/lib/task-recovery.ts`
- **前端影响方式**: 以兼容现有页面为原则，通过更真实的 `/api/tasks*` 响应契约提升可靠性，不重做当前页面结构
- **外部依赖**: 闪剪 OpenAPI、阿里云 OSS、Redis、LLM provider
- **数据模型与状态语义**: `VideoTask`, `VideoProductionPlan`, `Asset` 的状态解释和运行时语义会被收紧，必要时会引入显式 degraded/error classification
