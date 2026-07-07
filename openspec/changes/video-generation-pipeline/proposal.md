## Why

ClipFlow 当前只完成了运营侧（admin 认证、内容模板管理、抖音热榜采集、脚本生成）。用户侧的核心链路——注册登录、数字人克隆、视频合成、异步回调——全部缺失，无法产出任何视频。需要实现 `docs/shanjian-backend-service-spec.md` 中定义的完整后端服务，打通从用户注册到视频产出的全流程。

## What Changes

- 新增用户认证系统（注册/登录/JWT/middleware）
- 重写 `lib/shanjian.ts`，实现闪剪 OpenAPI 全量方法（资产查询、克隆服务、效果服务、8 种视频生成、任务管理）+ 完整错误码映射
- 新增数字人管理 API（极速/专业/图生三种克隆、列表、详情、删除）
- 新增声音克隆 API（克隆、列表含公共+自建、删除）
- 新增效果服务 API（TTS 文字转语音、ASR 语音转文字）
- 新增视频任务 API（支持全部 8 种视频类型的创建、列表、详情），含额度预检和并发控制
- 新增素材管理 API（OSS 直传签名、素材注册、列表、删除）
- 新增闪剪 Webhook 统一回调端点（幂等处理、按 taskId 分发、OSS 转存、结算扣费）
- 新增兜底轮询 Cron（超时任务主动查询闪剪状态）
- 新增文件格式前置校验库（训练视频/素材/音频规格检查）
- 新增算力成本计算与额度结算逻辑

## Capabilities

### New Capabilities

- `user-auth`: 用户注册、登录、JWT 签发与验证、withUserAuth middleware
- `shanjian-client`: 闪剪 OpenAPI 完整客户端封装（资产查询、克隆、效果、8 种视频生成、任务查询、错误码映射）
- `avatar-management`: 数字人分身管理（极速/专业/图生三种克隆方式、列表、详情、删除含远端同步）
- `voice-cloning`: 声音克隆与管理（克隆、列表含公共+自建、删除）
- `effect-services`: TTS 文字转语音 + ASR 语音转文字
- `video-tasks`: 视频生成任务全流程（8 种视频类型创建、列表、详情、额度预检、并发控制）
- `asset-management`: 用户素材管理（OSS 直传签名 URL、素材注册、列表、删除）
- `webhook-handler`: 闪剪异步回调统一处理（幂等去重、任务类型识别、OSS 转存、结算扣费）
- `task-polling`: 兜底轮询 Cron（超时任务主动查询闪剪、状态同步）
- `file-validation`: 上传前文件格式/尺寸/时长前置校验规则库

### Modified Capabilities

_无需修改已有 capability，现有模板管理和热榜模块保持不变。_

## Impact

- **新增 API 路由**: ~20 个新端点（`/api/auth/*`, `/api/avatars/*`, `/api/voices/*`, `/api/effects/*`, `/api/tasks/*`, `/api/assets/*`, `/api/webhook/*`, `/api/cron/poll-tasks`）
- **重写模块**: `lib/shanjian.ts` 从当前 5 个方法扩展到 20+ 个方法
- **新增模块**: `lib/user-auth.ts`, `lib/validation.ts`, `lib/credits.ts`, `lib/oss.ts`
- **外部依赖**: 闪剪 OpenAPI（需要 `SHANJIAN_APP_KEY`）、阿里云 OSS（需要 OSS 配置）
- **数据库**: Asset 表新增 `status`, `externalTaskId`, `externalSpeakerId`, `voiceModel`, `demoAudioUrl`, `errorCode`, `errorMessage`, `updatedAt` 字段以支持声音克隆；其余表无变更
- **Redis**: 新增 Webhook 幂等键（`webhook:{taskId}`）、轮询锁（`poll:{taskId}`）
