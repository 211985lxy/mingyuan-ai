# 抖音手机号主账号登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AIM 登录页增加抖音扫码登录，并坚持手机号是唯一主账号标识；已绑定抖音可直接登录，首次扫码必须完成手机号验证码绑定。

**Architecture:** 保留现有 `/api/integrations/douyin/*` 数据同步流程，新增独立的 `/api/auth/douyin/*` 登录流程。OAuth 回调只交换 `user_info` 并以一次性服务端登录挑战暂存 openid；手机号验证码完成后，事务内创建或查找手机号用户并绑定抖音登录身份。已有 `DouyinAccountBinding` 继续保存内容同步令牌，不把登录挑战令牌放进浏览器 Cookie。

**Tech Stack:** Next.js App Router, TypeScript, Prisma/MySQL, Vitest, React client components, 现有 JWT `mingyuan_user_session` Cookie。

## Global Constraints

- 手机号是账户唯一标识；抖音只提供扫码身份验证，不单独创建无手机号用户。
- 一个抖音 `openid` 只能归属一个 AIM 用户；一个 AIM 用户可以绑定多个抖音号。
- `ClientSecret`、access token 和 refresh token 只能在服务端处理，不能写日志或返回浏览器。
- 登录 OAuth 使用独立的一次性 `state` 和登录挑战，不能复用数据同步回调的 state。
- 原有密码登录、手机号验证码登录、登录后抖音数据绑定、令牌刷新和解绑行为保持不变。
- 不读取、修改或提交工作区已有的 `.env`、部署文件和无关未提交改动。
- 每个任务先写一个能正确失败的测试，再写最小实现；每个任务独立验证并提交。

---

## 文件地图

- `apps/web/prisma/identity.prisma`：新增登录身份和一次性 OAuth 挑战模型。
- `apps/web/prisma/migrations/20260905_add_douyin_login_identity/`：新增表迁移。
- `apps/web/src/features/auth/douyin-login.ts`：state、挑战、openid 归属和手机号完成登录的服务层。
- `apps/web/src/features/auth/contracts.ts`：抖音登录完成请求校验。
- `apps/web/src/app/api/auth/douyin/start/route.ts`：发起抖音扫码登录。
- `apps/web/src/app/api/auth/douyin/callback/route.ts`：处理抖音回调并路由已绑定/待绑定分支。
- `apps/web/src/app/api/auth/douyin/complete/route.ts`：手机号验证码完成绑定和登录。
- `apps/web/src/lib/douyin-openapi.ts`、`apps/web/src/env.ts`、`apps/web/.env.example`：独立登录回调地址与 `user_info` scope 配置。
- `apps/web/src/features/auth/login/sms-fields.tsx`：手机号和验证码共用字段。
- `apps/web/src/features/auth/login/sms-form.tsx`：改用共用字段，保持现有短信登录行为。
- `apps/web/src/features/auth/login/douyin-login-form.tsx`：扫码入口和首次扫码手机号绑定表单。
- `apps/web/src/features/auth/login/forms.ts`、`apps/web/src/app/(auth)/login/page.tsx`：导出并接入新登录模式。
- `apps/web/src/lib/api/auth.ts`：新增完成抖音登录的浏览器 API。
- `apps/web/src/features/integrations/douyin-binding.ts`、`apps/web/src/app/api/integrations/douyin/callback/route.ts`：数据绑定成功时认领登录身份，拒绝跨账号的同 openid 绑定。
- `apps/web/__tests__/unit/douyin-login.test.ts`：服务、路由和冲突分支测试。
- `apps/web/__tests__/unit/douyin-binding.test.ts`：补充数据绑定与登录身份归属测试。

### Task 1: Add persistent Douyin login identity and challenge models

**Files:**
- Modify: `apps/web/prisma/identity.prisma`
- Create: `apps/web/prisma/migrations/20260905_add_douyin_login_identity/migration.sql`
- Test: `apps/web/__tests__/unit/douyin-login.test.ts`

**Interfaces:**
- Produces Prisma models `DouyinLoginIdentity` (`openId` unique, `userId` indexed) and `DouyinLoginChallenge` (`stateHash` unique, openid fields, expiresAt, consumedAt).
- `DouyinLoginChallenge` stores only the exchanged `openId`, `unionId`, and scope; it does not store access/refresh tokens.

- [ ] **Step 1: Write the failing schema/service test**

Add a test that imports the future `createDouyinLoginChallenge` and asserts the challenge record is created with a hashed state, a ten-minute expiry, and no raw state value in the persisted data:

```ts
it("stores only a hashed state for a short-lived login challenge", async () => {
  prismaMocks.challengeCreate.mockResolvedValue({ id: "challenge-1" })
  const result = await createDouyinLoginChallenge({ state: "raw-state", openId: "open-1", scope: "user_info" })
  expect(result).toBe("challenge-1")
  expect(prismaMocks.challengeCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      stateHash: expect.not.stringContaining("raw-state"),
      openId: "open-1",
      scope: "user_info",
      expiresAt: expect.any(Date),
    }),
  })
})
```

- [ ] **Step 2: Run the test and verify it fails for the missing service**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: FAIL because `createDouyinLoginChallenge` and its Prisma mock do not exist.

- [ ] **Step 3: Add the Prisma models and migration**

Append these relations to `User` and add the models in `identity.prisma`:

```prisma
  douyinLoginIdentities DouyinLoginIdentity[]

model DouyinLoginIdentity {
  id        String   @id @default(cuid())
  userId    String
  openId    String   @unique @db.VarChar(128)
  unionId   String?  @db.VarChar(128)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model DouyinLoginChallenge {
  id          String    @id @default(cuid())
  stateHash   String    @unique @db.VarChar(64)
  openId      String    @db.VarChar(128)
  unionId     String?   @db.VarChar(128)
  scope       String    @db.VarChar(500)
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@index([expiresAt])
}
```

Create the matching additive MySQL migration with `CREATE TABLE IF NOT EXISTS`, a unique `stateHash` index, and the foreign key from `DouyinLoginIdentity.userId` to `User.id`. Do not alter or delete existing binding rows.

- [ ] **Step 4: Implement the minimal challenge hash service**

In `features/auth/douyin-login.ts`, use `sha256(state)` as `stateHash`, set `expiresAt` to `Date.now() + 10 * 60 * 1000`, and expose:

```ts
export function hashDouyinLoginState(state: string): string
export async function createDouyinLoginChallenge(input: {
  state: string
  openId: string
  unionId?: string | null
  scope: string
}): Promise<string>
```

- [ ] **Step 5: Run the focused test and commit**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: PASS for the challenge test. Commit only the schema, migration, service, and focused test:
`git add apps/web/prisma/identity.prisma apps/web/prisma/migrations/20260905_add_douyin_login_identity apps/web/src/features/auth/douyin-login.ts apps/web/__tests__/unit/douyin-login.test.ts && git commit -m "feat(auth): add douyin login identity challenge"`

### Task 2: Implement OAuth start and callback routing

**Files:**
- Modify: `apps/web/src/lib/douyin-openapi.ts`
- Modify: `apps/web/src/env.ts`
- Modify: `apps/web/.env.example`
- Create: `apps/web/src/app/api/auth/douyin/start/route.ts`
- Create: `apps/web/src/app/api/auth/douyin/callback/route.ts`
- Modify: `apps/web/src/features/auth/douyin-login.ts`
- Test: `apps/web/__tests__/unit/douyin-login.test.ts`

**Interfaces:**
- `GET /api/auth/douyin/start` redirects to the official QR page with `scope=user_info`, a random state, and `DOUYIN_LOGIN_REDIRECT_URI`.
- `GET /api/auth/douyin/callback` accepts `code` and `state`; it returns a session for a known identity or redirects to `/login?douyin=bind` with a short-lived challenge cookie for an unknown identity.

- [ ] **Step 1: Write failing route tests**

Add tests for three exact behaviors:

```ts
it("starts Douyin login with user_info and a state cookie", async () => {
  const response = await startDouyinLogin(new NextRequest("http://localhost/api/auth/douyin/start"))
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toContain("scope=user_info")
  expect(response.headers.get("set-cookie")).toContain("douyin_login_state=")
})

it("logs in an existing Douyin identity without asking for a phone", async () => {
  prismaMocks.identityFindUnique.mockResolvedValue({ userId: "u1", openId: "open-1" })
  prismaMocks.userFindUnique.mockResolvedValue(USER)
  exchangeCode.mockResolvedValue(TOKEN)
  const response = await douyinCallback(callbackRequest({ code: "code-1", state: "state-1" }))
  expect(response.status).toBe(302)
  expect(response.headers.get("location")).toContain("/lite")
  expect(response.headers.get("set-cookie")).toContain("mingyuan_user_session=")
})

it("routes an unknown Douyin identity to phone binding", async () => {
  prismaMocks.identityFindUnique.mockResolvedValue(null)
  exchangeCode.mockResolvedValue(TOKEN)
  const response = await douyinCallback(callbackRequest({ code: "code-1", state: "state-1" }))
  expect(response.headers.get("location")).toContain("/login?douyin=bind")
  expect(response.headers.get("set-cookie")).toContain("douyin_login_challenge=")
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: FAIL because the new routes and login redirect builder do not exist.

- [ ] **Step 3: Add separate login configuration and URL builder**

Add `DOUYIN_LOGIN_REDIRECT_URI` to `env.ts` and `.env.example`. Add a function with this contract:

```ts
export function buildDouyinLoginAuthorizationUrl(state: string): string
```

It must use the existing official connect endpoint, `response_type=code`, `scope=user_info`, `redirect_uri=DOUYIN_LOGIN_REDIRECT_URI`, and the supplied state. Leave the existing data-binding builder and default multi-scope unchanged.

- [ ] **Step 4: Implement start route**

Generate `randomBytes(16).toString("hex")`, set `douyin_login_state` as HttpOnly, Secure in production, SameSite=Lax, path `/`, maxAge 600, and redirect to `buildDouyinLoginAuthorizationUrl(state)`. Configuration errors return `/login?douyin_error=...` without leaking secrets.

- [ ] **Step 5: Implement callback route**

Validate `code`, compare the callback state with `douyin_login_state`, exchange the code with `exchangeDouyinCodeForToken`, then query `DouyinLoginIdentity` by `openId`. For a known identity, load the User, sign the existing JWT, set `mingyuan_user_session`, clear both OAuth cookies, and redirect to `/lite` for active subscriptions or `/activate` otherwise. For an unknown identity, create `DouyinLoginChallenge`, set `douyin_login_challenge` to its opaque id with the same ten-minute cookie settings, clear `douyin_login_state`, and redirect to `/login?douyin=bind`.

The callback must never call `authenticateRequest`; it is the public OAuth entry point. Missing state, invalid code, expired challenge, and token exchange failures redirect to `/login?douyin_error=...` with a generic user-facing message.

- [ ] **Step 6: Run route tests and commit**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: PASS for start, known identity, unknown identity, and CSRF rejection tests. Commit the route and configuration changes with `git commit -m "feat(auth): add douyin oauth login flow"`.

### Task 3: Complete first-time login with phone verification

**Files:**
- Modify: `apps/web/src/features/auth/contracts.ts`
- Create: `apps/web/src/app/api/auth/douyin/complete/route.ts`
- Modify: `apps/web/src/features/auth/douyin-login.ts`
- Test: `apps/web/__tests__/unit/douyin-login.test.ts`

**Interfaces:**
- `POST /api/auth/douyin/complete` accepts `{ phone, code }` and requires the HttpOnly `douyin_login_challenge` cookie.
- Success returns `{ user: AuthUserPayload }` and sets `mingyuan_user_session`; it consumes the challenge and clears its cookie.

- [ ] **Step 1: Write failing completion tests**

Cover an existing phone user, a new phone user, an already-claimed openid, a missing challenge, and a bad SMS code. The existing-user success assertion must verify `prisma.user.findUnique({ where: { phone } })`, identity creation, and the session cookie. The new-user case must verify the placeholder email format used by `/api/auth/sms/login`.

- [ ] **Step 2: Run the focused test and verify the expected failures**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: FAIL because the completion route and service are absent.

- [ ] **Step 3: Add completion validation and service transaction**

Add `douyinCompleteBodySchema` by reusing the existing phone and six-digit code rules. In the service, consume the login SMS code first, load the challenge only when it is unconsumed and unexpired, then run one Prisma transaction:

```ts
const user = existingUser ?? await tx.user.create({
  data: {
    phone,
    email: `${phone}@phone.local`,
    password: await hashPassword(randomBytes(24).toString("hex")),
    name: `用户${phone.slice(-4)}`,
  },
})
await tx.douyinLoginIdentity.create({
  data: { userId: user.id, openId: challenge.openId, unionId: challenge.unionId },
})
await tx.douyinLoginChallenge.update({
  where: { id: challenge.id },
  data: { consumedAt: new Date() },
})
```

If the unique `openId` insert raises a conflict, return `409 DOUYIN_ALREADY_BOUND` and do not issue a session. If the phone is already linked to the same identity, treat the operation as an idempotent login; if it is linked to another identity, return `409 PHONE_ALREADY_BOUND`.

- [ ] **Step 4: Implement the route and cookie cleanup**

Rate-limit the completion by `phone` and request IP with the existing auth limiter, return the same generic SMS error for invalid or expired codes, sign the normal seven-day JWT, call `setSessionCookie`, and clear `douyin_login_challenge`.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-login.test.ts`

Expected: PASS for all completion branches. Commit with `git commit -m "feat(auth): require phone for first douyin login"`.

### Task 4: Add the login page UI and browser API

**Files:**
- Create: `apps/web/src/features/auth/login/sms-fields.tsx`
- Create: `apps/web/src/features/auth/login/douyin-login-form.tsx`
- Modify: `apps/web/src/features/auth/login/sms-form.tsx`
- Modify: `apps/web/src/features/auth/login/forms.ts`
- Modify: `apps/web/src/app/(auth)/login/page.tsx`
- Modify: `apps/web/src/lib/api/auth.ts`
- Test: `apps/web/__tests__/unit/douyin-login.test.ts`

**Interfaces:**
- `DouyinLoginForm` exposes “抖音扫码登录” and navigates to `/api/auth/douyin/start`.
- When `/login?douyin=bind` is present, it displays the existing phone/code fields plus the text “抖音登录还差一步：绑定手机号”，then calls `POST /api/auth/douyin/complete`.

- [ ] **Step 1: Add a component-level failing contract test**

Test the exported UI contract with the existing component test setup: the default login page renders a button named “抖音扫码登录”; the bind state renders “绑定手机号” and the submit action calls `/api/auth/douyin/complete` with the entered phone and code.

- [ ] **Step 2: Run the component test and verify it fails**

Run: `pnpm --dir apps/web test:component -- __tests__/unit/douyin-login.test.ts`

Expected: FAIL because the new component and login mode do not exist.

- [ ] **Step 3: Extract shared SMS fields**

Move `PhoneField` and `CodeField` from `sms-form.tsx` to `sms-fields.tsx` without changing labels, validation, countdown, or error copy. Update `sms-form.tsx` to import them; existing SMS tests must remain green.

- [ ] **Step 4: Implement the Douyin form and API call**

Add `completeDouyinLogin(phone, code)` in `lib/api/auth.ts` using `request(..., { auth: false, method: "POST" })`. The form must reuse `PHONE_PATTERN`, `CODE_PATTERN`, `sendSmsLoginCode`, and shared fields; on success call the same `handleSuccess` path as password/SMS login.

- [ ] **Step 5: Add the mode and callback state to the login page**

Extend `LoginMode` with `douyin`, add a QR icon tab/button, and read `douyin=bind`/`douyin_error` from the URL. Keep the normal default mode and registration link unchanged. Use `replaceState` after displaying one-time errors so codes and state hints do not remain in browser history.

- [ ] **Step 6: Run UI and regression tests and commit**

Run: `pnpm --dir apps/web test:component -- __tests__/unit/douyin-login.test.ts` and `pnpm --dir apps/web test -- __tests__/unit/sms-login.test.ts`

Expected: PASS. Commit with `git commit -m "feat(ui): add douyin qr login entry"`.

### Task 5: Keep data binding and login identity ownership consistent

**Files:**
- Modify: `apps/web/src/features/integrations/douyin-binding.ts`
- Modify: `apps/web/src/app/api/integrations/douyin/callback/route.ts`
- Modify: `apps/web/__tests__/unit/douyin-binding.test.ts`
- Modify: `apps/web/__tests__/unit/douyin-login.test.ts`

**Interfaces:**
- `claimDouyinLoginIdentity(userId: string, token: DouyinToken): Promise<void>` creates the unique login identity or throws a typed conflict when another user owns the openid.
- Data binding callback claims the identity after the authenticated user is known, without changing its existing token/profile sync response.

- [ ] **Step 1: Write failing ownership tests**

Add tests that a first data binding creates the login identity, a repeat binding by the same user succeeds, and a different user attempting the same `openId` returns the existing conflict without creating a second identity.

- [ ] **Step 2: Run the binding tests and verify they fail**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-binding.test.ts`

Expected: FAIL because `claimDouyinLoginIdentity` is not called and the identity Prisma mock does not exist.

- [ ] **Step 3: Implement owner-first identity claiming**

In the binding service, look up the identity by `openId`, permit the same `userId`, reject a different owner with `DOUYIN_IDENTITY_CONFLICT`, and create/update the existing `DouyinAccountBinding` only after the ownership check. For legacy rows created before this feature, if exactly one binding owner exists, adopt that owner; if multiple owners exist, reject and require manual resolution.

- [ ] **Step 4: Preserve the existing sync contract**

Update the integration callback to call the claim helper after code exchange/profile fetch and before writing the Lark sync result. Keep `/api/integrations/douyin/accounts` token redaction, refresh, and unbind behavior unchanged.

- [ ] **Step 5: Run regression tests and commit**

Run: `pnpm --dir apps/web test -- __tests__/unit/douyin-binding.test.ts __tests__/unit/douyin-login.test.ts`

Expected: PASS. Commit with `git commit -m "feat(auth): unify douyin identity ownership"`.

### Task 6: Verify configuration, build, and end-to-end behavior

**Files:**
- Modify only when approved: `apps/web/.env.example` (already updated in Task 2)
- No production secret files are read or changed.

- [ ] **Step 1: Add the website callback URL in Douyin Open Platform**

In the website app’s “开发设置 → 授权回调”, add exactly:

```text
https://mingyuan-ai.cn/api/auth/douyin/callback
```

Keep the existing data-binding callback. Set the production environment variable `DOUYIN_LOGIN_REDIRECT_URI` to the same URL; do not print or commit `DOUYIN_CLIENT_SECRET`.

- [ ] **Step 2: Run the full verification set**

Run:

```bash
pnpm --dir apps/web test -- __tests__/unit/sms-login.test.ts __tests__/unit/douyin-binding.test.ts __tests__/unit/douyin-login.test.ts
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

Expected: all focused tests pass, typecheck/lint/build exit 0, and no secret values appear in output.

- [ ] **Step 3: Perform the manual acceptance flow**

1. Open `/login`, choose “抖音扫码登录”, and scan with the approved test account.
2. Confirm an already linked openid goes directly to `/lite` or `/activate` according to subscription status.
3. Use a new test openid, confirm the page requires phone verification, complete the SMS code, and confirm a `mingyuan_user_session` cookie and a phone-backed User row.
4. Repeat the same scan and confirm direct login without another phone prompt.
5. Try the same openid with a different phone and confirm a conflict message with no second account.
6. Verify password login, SMS login, “绑定抖音账号”, refresh, and unbind still work.

- [ ] **Step 4: Commit the verification-only documentation if needed**

Do not commit runtime logs, cookies, QR codes, access tokens, or production database dumps. If all checks pass, report the implementation commits and the required production callback/environment configuration separately.
