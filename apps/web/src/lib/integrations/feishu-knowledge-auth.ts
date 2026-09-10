/**
 * 飞书知识检索的身份票据：应用身份换票、用户 OAuth 换票/刷新。
 * 不落库、不打日志；明文 token 只在内存里传递。
 */

import { secretsMatch } from "./feishu-knowledge-crypto"

const TENANT_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
const USER_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
const AUTHORIZE_URL = "https://accounts.feishu.cn/open-apis/authen/v1/authorize"
const TOKEN_SAFETY_MS = 120_000

export const FEISHU_KNOWLEDGE_OAUTH_SCOPES = [
  "offline_access",
  "search:docs:read",
  "wiki:node:read",
  "docx:document:readonly",
] as const

export const FEISHU_KNOWLEDGE_OAUTH_SCOPE_STRING = FEISHU_KNOWLEDGE_OAUTH_SCOPES.join(" ")

export function resolveFeishuKnowledgeOAuthRedirectUri(origin: string, configured?: string | null): string {
  return configured?.trim() || `${origin}/api/integrations/feishu/knowledge/oauth/callback`
}

export function feishuOAuthStatesMatch(saved?: string | null, incoming?: string | null): boolean {
  if (!saved || !incoming) return false
  return secretsMatch(saved, incoming)
}

type JsonRecord = Record<string, unknown>
type CachedToken = { token: string; expiresAt: number }

const tenantTokenCache = new Map<string, CachedToken>()

export interface FeishuUserTokenSet {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt?: Date
  scope: string
}

export function clearFeishuTenantTokenCache() {
  tenantTokenCache.clear()
}

export function buildFeishuKnowledgeAuthorizeUrl(input: {
  appId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: FEISHU_KNOWLEDGE_OAUTH_SCOPE_STRING,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function getFeishuTenantAccessToken(input: {
  appId: string
  appSecret: string
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<string> {
  const now = input.now ?? Date.now
  const cached = tenantTokenCache.get(input.appId)
  if (cached && cached.expiresAt - TOKEN_SAFETY_MS > now()) return cached.token
  const payload = await readJson(input.fetchImpl ?? fetch, TENANT_TOKEN_URL, {
    method: "POST",
    body: { app_id: input.appId, app_secret: input.appSecret },
  })
  const token = readString(payload.tenant_access_token)
  if (readNumber(payload.code) !== 0 || !token) {
    throw new Error(readString(payload.msg) || "飞书 tenant_access_token 获取失败")
  }
  const expireSec = readNumber(payload.expire)
  const ttlSec = expireSec && expireSec > 0 ? expireSec : 7200
  tenantTokenCache.set(input.appId, { token, expiresAt: now() + ttlSec * 1000 })
  return token
}

export async function exchangeFeishuAuthorizationCode(input: {
  appId: string
  appSecret: string
  code: string
  redirectUri: string
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<FeishuUserTokenSet> {
  return requestUserToken({
    appId: input.appId,
    appSecret: input.appSecret,
    body: {
      grant_type: "authorization_code",
      client_id: input.appId,
      client_secret: input.appSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    },
    fetchImpl: input.fetchImpl,
    now: input.now,
  })
}

export async function refreshFeishuUserAccessToken(input: {
  appId: string
  appSecret: string
  refreshToken: string
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<FeishuUserTokenSet> {
  return requestUserToken({
    appId: input.appId,
    appSecret: input.appSecret,
    body: {
      grant_type: "refresh_token",
      client_id: input.appId,
      client_secret: input.appSecret,
      refresh_token: input.refreshToken,
    },
    fetchImpl: input.fetchImpl,
    now: input.now,
  })
}

export function isFeishuUserTokenRevoked(code?: number, error?: string): boolean {
  const err = (error ?? "").toLowerCase()
  if (err.includes("invalid_grant") || err.includes("invalid_token")) return true
  return code === 20026 || code === 20027 || code === 20028
}

async function requestUserToken(input: {
  appId: string
  appSecret: string
  body: JsonRecord
  fetchImpl?: typeof fetch
  now?: () => number
}): Promise<FeishuUserTokenSet> {
  const now = input.now ?? Date.now
  const payload = await readJson(input.fetchImpl ?? fetch, USER_TOKEN_URL, {
    method: "POST",
    body: input.body,
  })
  const code = readNumber(payload.code)
  const error = [readString(payload.error), readString(payload.error_description), readString(payload.msg)]
    .filter(Boolean)
    .join(" ")
  if ((code !== undefined && code !== 0) || !readString(payload.access_token)) {
    const err = new Error(readString(payload.error_description) || readString(payload.msg) || "飞书用户令牌获取失败")
    ;(err as Error & { feishuCode?: number; revoked?: boolean }).feishuCode = code
    ;(err as Error & { feishuCode?: number; revoked?: boolean }).revoked = isFeishuUserTokenRevoked(code, error)
    throw err
  }
  const accessExpires = readNumber(payload.expires_in) ?? 7200
  const refreshExpires = readNumber(payload.refresh_token_expires_in)
  return {
    accessToken: readString(payload.access_token),
    refreshToken: readString(payload.refresh_token),
    accessTokenExpiresAt: new Date(now() + accessExpires * 1000),
    refreshTokenExpiresAt: refreshExpires ? new Date(now() + refreshExpires * 1000) : undefined,
    scope: readString(payload.scope),
  }
}

async function readJson(
  fetcher: typeof fetch,
  url: string,
  input: { method: string; body?: JsonRecord },
): Promise<JsonRecord> {
  const response = await fetcher(url, {
    method: input.method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const payload = (await response.json()) as JsonRecord
  return payload
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}
