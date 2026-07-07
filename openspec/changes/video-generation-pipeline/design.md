## Context

ClipFlow 是 Next.js 16 App Router monorepo，后端 API 在 `apps/web/src/app/api/`。已有 admin 认证（JWT）、内容模板 CRUD、抖音热榜采集。数据库用 MySQL（Prisma 7），缓存用 Redis（ioredis）。闪剪 OpenAPI 是全异步模式——提交任务返回 taskId，结果通过 Webhook 回调或轮询获取。闪剪生成结果仅保留 24 小时，必须及时转存。

现有 Prisma schema 已定义 `User`, `Avatar`, `Asset`, `Script`, `VideoTask` 模型。Asset 表需扩展以支持声音克隆（新增 status, externalTaskId, externalSpeakerId, voiceModel, demoAudioUrl 等字段）。`lib/shanjian.ts` 已有基础骨架（request 函数 + 5 个查询方法），需扩展到完整实现。

## Goals / Non-Goals

**Goals:**
- 实现 `docs/shanjian-backend-service-spec.md` 中定义的全部后端服务
- 用户能完成：注册 → 克隆数字人 → 选模板生成脚本 → 提交视频合成 → 拿到视频 URL
- 闪剪全部 23 个 API 端点的客户端封装
- Webhook 幂等处理 + 兜底轮询双保险
- 视频结果 24 小时内自动转存 OSS

**Non-Goals:**
- 前端 UI 实现（本次只做后端 API）
- 支付/计费系统对接（只实现内部 credits 结算）
- 视频内容审核
- 多租户/组织架构

## Decisions

### D1: 用户认证复用 admin-auth 模式

**决定**: 参照现有 `lib/admin-auth.ts` 的 JWT + bcrypt 模式，新建 `lib/user-auth.ts`，使用独立的 `JWT_SECRET`。提供 `withUserAuth` middleware wrapper，签名方式与 `withAdminAuth` 一致。

**理由**: 代码库已有成熟的 JWT 模式，复用同一套 pattern 降低认知负担。User 和 AdminUser 是独立的表和令牌体系，互不干扰。

### D2: 闪剪客户端保持函数式导出，不用 class

**决定**: 保持当前 `lib/shanjian.ts` 的函数式导出风格（`export async function xxx`），不重构为 class。内部共享 `request<T>()` 基础函数。

**理由**: 现有代码已经是函数式风格，Next.js App Router 的 route handler 也是函数式。保持一致性，避免不必要的重构。

### D3: Webhook 统一入口 + 按 taskId 分发

**决定**: 单一端点 `POST /api/webhook/shanjian` 处理所有闪剪回调。收到请求立即返回 200（快速 ACK），通过查找 `avatar.externalTaskId` 和 `videoTask.externalTaskId` 识别任务类型，分别走不同处理逻辑。

**理由**: 闪剪所有异步任务共用同一个 callbackUrl。统一入口简化配置，按 taskId 查库分发是 spec 推荐的标准模式。快速 ACK 防止闪剪超时重试。

### D4: OSS 转存使用流式下载+上传

**决定**: Webhook 成功回调后，立即从闪剪 URL 流式下载视频/封面/音频，上传到阿里云 OSS。使用 `@ali-cloud/oss` SDK。如果 OSS 未配置，降级保存闪剪原始 URL（带 24 小时过期风险）。

**理由**: 闪剪结果 24 小时过期是硬约束。流式处理避免内存溢出（视频可能很大）。降级策略让开发阶段不依赖 OSS 也能跑通。

### D5: 视频任务创建统一入口，type 字段区分

**决定**: `POST /api/tasks` 单一端点，请求体中 `type` 字段区分 9 种任务类型（`virtualman_broadcast`, `realman_broadcast`, `broadcast_mixcut`, `news_mixcut`, `virtualman_video`, `custom_virtualman_broadcast`, `custom_realman_broadcast`, `custom_broadcast_mixcut`, `ai_cover`）。内部按 type 路由到对应的闪剪 API 方法。AI cover 虽然产出图片而非视频，但走同一套异步任务流程。

**理由**: 统一入口简化前端调用。不同类型的请求体差异通过 TypeScript union type 处理。所有异步任务共享 webhook + 轮询 + 幂等机制。

### D6: 额度预检 → 乐观扣减 → 失败退还

**决定**: 创建视频任务时：1) 估算 credits（文字长度 × 语速 × 算力单价）2) 预检余额是否充足 3) 乐观扣减 credits 4) 任务失败时退还。不在 Webhook 成功时才扣费，因为回调可能延迟。

**理由**: 防止用户在回调到达前连续提交超额任务。失败退还保证公平。

### D7: 文件校验为纯函数库，不依赖外部服务

**决定**: `lib/validation.ts` 导出纯函数，基于文件元信息（size, duration, format, resolution）校验。不做服务端文件探测（如 ffprobe），校验数据由客户端上传时提供或从 OSS 元信息获取。

**理由**: 前置校验的目的是快速拦截明显不合规的上传，节省闪剪 API 调用。精确校验交给闪剪做，我们处理其返回的 `Invalid.File.*` 错误码。

## Risks / Trade-offs

- **[闪剪 API Key 缺失]** → 所有闪剪相关功能不可用。Mitigation: 客户端方法检查 APP_KEY 存在性，缺失时返回明确的 `SHANJIAN_NOT_CONFIGURED` 错误。
- **[OSS 未配置]** → 视频转存失败，24 小时后闪剪 URL 过期。Mitigation: 降级保存原始 URL，日志告警提醒配置 OSS。
- **[Webhook 不可达]** → 回调失不到。Mitigation: 兜底轮询 Cron 每 5 分钟扫描超时任务，主动查询闪剪状态。
- **[并发超限]** → 闪剪返回 `Concurrency.Limit`。Mitigation: 用户层面限制并发数（free=1, basic=3, pro=5），闪剪层面捕获错误返回友好提示。
- **[幂等失效]** → Redis 宕机时 Webhook 可能重复处理。Mitigation: 数据库层面的状态机转换（只允许 processing→completed/failed）提供第二道防线。
