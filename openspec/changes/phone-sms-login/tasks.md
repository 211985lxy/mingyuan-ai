# Tasks — 手机号 + 短信验证码登录

## 1. 数据模型与迁移
- [x] `identity.prisma`：User 增加 `phone String? @unique`；新增 `SmsVerificationCode` 模型
- [x] 生成并验证迁移 `20260903100000_add_phone_sms_login`（本地 dev 库已应用并 resolve）
- [x] 手机号自动注册的占位邮箱策略落地（`${phone}@phone.local`），`buildAuthUserPayload` 中过滤占位符

## 2. SMS Provider 抽象
- [x] `lib/sms/`：provider 接口 + `console` 模式 + `aliyun` 模式（REST + RPC 签名 V1，零 SDK 依赖）
- [x] `env.ts` 增加 `SMS_PROVIDER` / `ALIYUN_SMS_*` / `SMS_SIGN_NAME` / `SMS_TEMPLATE_CODE` 校验；production 下 console 模式 fail-fast
- [x] ~~`@alicloud/dysmsapi20170525` 依赖接入~~ 改为 fetch 直调阿里云 SMS API，不引入 SDK

## 3. API
- [x] `features/auth/contracts.ts`：`smsSendBodySchema` / `smsLoginBodySchema`
- [x] `POST /api/auth/sms/send`：三重限流（phone 60s/小时/日 + IP 小时）、验证码哈希落库、下发
- [x] `POST /api/auth/sms/login`：验码（attempts 计数 + 一次性消费）、未注册自动注册、签发既有 user session
- [x] 单测：`__tests__/unit/sms-login.test.ts`（10 例，含限流、过期、错误次数、自动注册、防枚举语义）

## 4. 前端
- [x] 登录页「密码登录 / 验证码登录」双 Tab + 60s 倒计时按钮
- [x] `lib/api/auth.ts` 增加 `sendSmsLoginCode` / `loginUserBySms`

## 5. 上线前检查
- [x] 本地端到端验证（2026-09-04）：发码 200 + console 日志取码；60s 内重发 429；正确码登录 200 并自动注册（占位邮箱对外显示为手机号）；同码重放 401；session cookie 访问 /api/auth/me 正常（测试数据已清理）
- [ ] 短信签名与模板审核通过（人工，阻塞生产）
- [ ] 生产环境变量配置 + console 模式禁用验证
- [x] 短信发送量告警：发码路由统计全局 24h 发送量，超阈值（500）打 warn 日志供告警采集
- [x] 过期验证码清理：`purgeExpiredCodes` 挂入既有 `GET /api/cron/cleanup`（Bearer CRON_SECRET 鉴权）
- [ ] openspec 归档：验收证据（生产环境真实发码 curl 记录）

