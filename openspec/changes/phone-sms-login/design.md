# Design — 手机号 + 短信验证码登录

## 数据模型（prisma/identity.prisma）

```prisma
model User {
  // 既有字段不变
  phone String? @unique // 手机号登录通道；存量用户为空
}

model SmsVerificationCode {
  id          String   @id @default(cuid())
  phone       String   // 中国大陆手机号，E.164 存储或 11 位裸号（约定：11 位裸号 + 校验 ^1[3-9]\d{9}$）
  codeHash    String   // bcrypt/sha256(code + salt)，明文不落库
  purpose     String   // login（首期仅此一种）
  expiresAt   DateTime // 创建后 5 分钟
  attempts    Int      @default(0) // 验证失败计数，>=5 作废
  consumedAt  DateTime?
  ip          String?
  createdAt   DateTime @default(now())

  @@index([phone, createdAt])
}
```

## API 契约

### POST /api/auth/sms/send

```jsonc
// 请求
{ "phone": "13800138000" }
// 成功 200
{ "sent": true, "retryAfterSeconds": 60 }
// 错误：400 非法手机号 / 429 触发限流（Retry-After 头）
```

- 限流（复用 `allowAuthAttempt` 的 Redis 通道，key 前缀 `sms-send`）：
  - 同手机号：60s 内 1 条、自然小时 5 条、自然日 10 条。
  - 同 IP：小时 20 条。
- 命中限流一律返回 `sent: true` 语义（不泄露是否已发），但 HTTP 429 场景除外（对同一 phone 的重复请求幂等返回 retryAfterSeconds，不再真实下发）。
- 生产要求 `SMS_PROVIDER=aliyun`；`console` 模式在 NODE_ENV=production 下启动即抛配置错误。

### POST /api/auth/sms/login

```jsonc
// 请求
{ "phone": "13800138000", "code": "123456" }
// 成功 200（与现有 /api/auth/login 响应结构一致）
{ "user": { /* buildAuthUserPayload(user) */ } }
```

- 验码流程：取该手机号最近一条未消费且未过期的码 → `attempts++` → 比对哈希 → 成功则 `consumedAt=now` 并登录。
- 用户不存在：自动注册 `User { phone, email: null? }` —— **注意现有 `email String @unique` 非可空**，需要将 email 改为 `String?` 并同步所有 `findUnique({ where: { email } })` 调用点的空值处理；或首期生成占位邮箱 `${phone}@phone.local`（推荐，改动面最小，二期迁移）。**取占位邮箱方案**，但在 `/api/auth/me` 与前端展示层过滤该占位符。
- 登录成功复用 `signUserToken` + `setSessionCookie(response, "user", token)`。
- 验码失败限流：同 phone 15 分钟 8 次（与现有登录限流一致）。

## 短信 Provider 抽象

`apps/web/src/lib/sms/`：

- `provider.ts`：`interface SmsProvider { sendLoginCode(phone, code): Promise<void> }`
- `aliyun.ts`：阿里云 dysmsapi SDK，模板参数 `{ code }`。
- `console.ts`：本地开发，`console.log` 验证码。
- `index.ts`：按 `env.SMS_PROVIDER` 单例导出；env 校验加入 `env.ts`（凭证缺失时 fail-fast）。

## 前端

- 登录页新增 Tab：「验证码登录」（手机号 + 验证码 + 「获取验证码」按钮含 60s 倒计时）/「密码登录」（现状不动）。
- 表单校验进 `features/auth/contracts.ts`：`smsSendBodySchema`、`smsLoginBodySchema`。

## 安全清单

- 验证码 6 位数字、5 分钟有效、明文不落库、一次性消费。
- 发送接口不区分"手机号是否已注册"（防枚举）。
- 短信轰炸三重限流（phone 小时/日、IP 小时）+ 429 响应。
- console 模式生产禁用。
- 既有 CSRF / session 机制零改动。
