# 手机号 + 短信验证码登录

## Why

当前用户登录仅有邮箱 + 密码（`/api/auth/login`，`features/auth/contracts.ts`），对 C 端 IP 创作者门槛偏高。手机号 + 短信验证码是国内用户最熟悉、流失最低的登录方式，且不依赖第三方平台资质（对比微信开放平台需企业认证 ¥300/年、抖音开放平台审核难通过）。

## What Changes

- `User` 模型（`prisma/identity.prisma`）新增 `phone String? @unique`，支持邮箱或手机号双通道登录。
- 新增 `SmsVerificationCode` 模型：记录手机号、验证码哈希、过期时间、尝试次数、用途（login / bind）。
- 新增两个 API：
  - `POST /api/auth/sms/send`：发送验证码（图形/行为验证码前置可选，首期仅限流）。
  - `POST /api/auth/sms/login`：验码登录，手机号未注册则自动注册（无密码，后续可设置）。
- 接入短信服务商 SDK（默认阿里云 SMS，通过 env 配置 provider，本地开发提供 `console` 假发送模式打印验证码到日志）。
- 登录页（`apps/web` 用户端）新增「手机号登录」Tab，与现有邮箱密码登录并存。
- 复用现有会话体系：`signUserToken` + `setSessionCookie(response, "user", token)`，不新增会话机制。
- 复用并扩展 `features/auth/auth-rate-limit.ts`：按手机号 + IP 双维度限流（发送 1 条/60s、5 条/小时；验码失败 5 次锁定）。

## Non-goals

- 不做微信扫码 / 抖音 OAuth。**决策（2026-09-05）**：微信登录推迟到小程序启动时一并办理（微信开放平台认证 ¥300/年，届时与小程序账号同主体注册以打通 UnionID）；抖音登录放弃。当前唯一登录增量通道为手机号短信。
- 不做手机号绑定/换绑管理页（仅登录链路；绑定放二期）。
- 不改动 admin 登录（admin 仍走独立密码）。
- 不引入新会话机制或 JWT 改造。

## Impact

- 数据库：新增迁移（User.phone 可空唯一 + 新表 SmsVerificationCode）。
- 依赖：新增 `@alicloud/dysmsapi20170525`（或腾讯云 SMS SDK，按账号资质定）。
- 环境变量：`SMS_PROVIDER`（aliyun | console）、`ALIYUN_SMS_*` 凭证、`SMS_SIGN_NAME`、`SMS_TEMPLATE_CODE`。
- 风险：短信资费与轰炸防护——上线前必须确认限流与告警生效，console 模式禁止用于生产。

## 前置条件（人工）

- 办理阿里云/腾讯云账号实名 + 短信签名与模板审核（审核通过前可用 console 模式开发联调）。
