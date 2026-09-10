import { describe, expect, it } from "vitest"

import {
  buildFeishuKnowledgeAuthorizeUrl,
  exchangeFeishuAuthorizationCode,
  feishuOAuthStatesMatch,
  isFeishuUserTokenRevoked,
  refreshFeishuUserAccessToken,
  resolveFeishuKnowledgeOAuthRedirectUri,
} from "@/lib/integrations/feishu-knowledge-auth"
import { createFeishuKnowledgeClient } from "@/lib/integrations/feishu-knowledge-client"
import {
  createMemoryFeishuOperatorCredentialStore,
  resolveKnowledgeUserAccessToken,
  toEncryptedOperatorRecord,
} from "@/lib/integrations/feishu-knowledge-credentials"
import { decryptFeishuSecret, encryptFeishuSecret } from "@/lib/integrations/feishu-knowledge-crypto"
import { executeFeishuKnowledgeTool } from "@/lib/integrations/feishu-knowledge-tool"

const APP = { appId: "cli_test", appSecret: "app-secret" }
const KEY = "ab".repeat(32)
const USER_ACCESS = "u-test-access"
const USER_REFRESH = "r-test-refresh"
const NOW = Date.parse("2026-09-10T00:00:00.000Z")

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

function createInspectingFetch(replies: Array<(url: string) => Response>) {
  const calls: Array<{ url: string; auth?: string; body?: unknown }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({
      url,
      auth: headers.get("Authorization") ?? undefined,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected fetch: ${url}`)
    return reply(url)
  }
  return { fetchImpl, calls }
}

describe("feishu knowledge crypto", () => {
  it("加密后再解密能还原，密文不含明文", () => {
    const packed = encryptFeishuSecret(USER_ACCESS, KEY)
    expect(packed.startsWith("v1.")).toBe(true)
    expect(packed).not.toContain(USER_ACCESS)
    expect(decryptFeishuSecret(packed, KEY)).toBe(USER_ACCESS)
  })

  it("密钥不对时拒绝解密", () => {
    const packed = encryptFeishuSecret(USER_ACCESS, KEY)
    expect(() => decryptFeishuSecret(packed, "cd".repeat(32))).toThrow(/FEISHU_TOKEN_ENCRYPTION_KEY|密钥/)
  })
})

describe("feishu knowledge oauth", () => {
  it("授权链接只带只读检索 scope，不含 app secret", () => {
    const url = buildFeishuKnowledgeAuthorizeUrl({
      appId: APP.appId,
      redirectUri: "https://mingyuan.example/api/integrations/feishu/knowledge/oauth/callback",
      state: "state-1",
    })
    expect(url).toContain("accounts.feishu.cn/open-apis/authen/v1/authorize")
    expect(url).toContain("offline_access")
    expect(url).toContain("search%3Adocs%3Aread")
    expect(url).not.toContain(APP.appSecret)
  })

  it("未配置回调地址时回落到当前站点的 oauth/callback", () => {
    expect(resolveFeishuKnowledgeOAuthRedirectUri("https://mingyuan.example", "")).toBe(
      "https://mingyuan.example/api/integrations/feishu/knowledge/oauth/callback",
    )
  })

  it("state 必须完全一致才通过", () => {
    expect(feishuOAuthStatesMatch("abc123", "abc123")).toBe(true)
    expect(feishuOAuthStatesMatch("abc123", "abc124")).toBe(false)
    expect(feishuOAuthStatesMatch("abc123", null)).toBe(false)
    expect(feishuOAuthStatesMatch(undefined, "abc123")).toBe(false)
  })

  it("授权码换票成功后只在内存里拿 access/refresh", async () => {
    const { fetchImpl, calls } = createInspectingFetch([
      () =>
        jsonResponse({
          code: 0,
          access_token: USER_ACCESS,
          refresh_token: USER_REFRESH,
          expires_in: 7200,
          refresh_token_expires_in: 604800,
          scope: "offline_access search:docs:read",
        }),
    ])
    const tokens = await exchangeFeishuAuthorizationCode({
      ...APP,
      code: "auth-code",
      redirectUri: "https://mingyuan.example/callback",
      fetchImpl,
      now: () => NOW,
    })
    expect(tokens.accessToken).toBe(USER_ACCESS)
    expect(tokens.refreshToken).toBe(USER_REFRESH)
    expect(calls[0]?.url).toContain("authen/v2/oauth/token")
    expect(JSON.stringify(calls[0]?.body)).not.toContain(USER_ACCESS)
  })

  it("refresh 被撤销时标记 revoked", async () => {
    expect(isFeishuUserTokenRevoked(undefined, "invalid_grant")).toBe(true)
    const { fetchImpl } = createInspectingFetch([
      () => jsonResponse({ code: 20026, error: "invalid_grant", error_description: "refresh token is invalid" }),
    ])
    await expect(
      refreshFeishuUserAccessToken({
        ...APP,
        refreshToken: USER_REFRESH,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ revoked: true, feishuCode: 20026 })
  })
})

describe("feishu knowledge operator credentials", () => {
  it("未过期时直接返回用户身份，不打飞书刷新接口", async () => {
    const store = createMemoryFeishuOperatorCredentialStore(
      toEncryptedOperatorRecord(
        {
          accessToken: USER_ACCESS,
          refreshToken: USER_REFRESH,
          accessTokenExpiresAt: new Date(NOW + 10 * 60_000),
          scope: "offline_access search:docs:read",
        },
        KEY,
      ),
    )
    const fetchImpl = async () => {
      throw new Error("should not refresh")
    }
    const token = await resolveKnowledgeUserAccessToken({
      ...APP,
      encryptionKey: KEY,
      fetchImpl,
      now: () => NOW,
      store,
    })
    expect(token).toBe(USER_ACCESS)
  })

  it("临近过期时刷新并回写加密凭证", async () => {
    const store = createMemoryFeishuOperatorCredentialStore(
      toEncryptedOperatorRecord(
        {
          accessToken: "u-old-access",
          refreshToken: USER_REFRESH,
          accessTokenExpiresAt: new Date(NOW + 30_000),
          scope: "offline_access search:docs:read",
        },
        KEY,
      ),
    )
    const { fetchImpl } = createInspectingFetch([
      () =>
        jsonResponse({
          code: 0,
          access_token: "u-new-access",
          refresh_token: "r-new-refresh",
          expires_in: 7200,
          scope: "offline_access search:docs:read",
        }),
    ])
    const token = await resolveKnowledgeUserAccessToken({
      ...APP,
      encryptionKey: KEY,
      fetchImpl,
      now: () => NOW,
      store,
    })
    expect(token).toBe("u-new-access")
    const saved = await store.loadActive()
    expect(saved).toBeTruthy()
    expect(decryptFeishuSecret(saved!.encryptedAccessToken, KEY)).toBe("u-new-access")
    expect(saved!.encryptedAccessToken).not.toContain("u-new-access")
  })

  it("用户撤销后回退：resolve 返回空，后续检索改走 tenant", async () => {
    const store = createMemoryFeishuOperatorCredentialStore(
      toEncryptedOperatorRecord(
        {
          accessToken: USER_ACCESS,
          refreshToken: USER_REFRESH,
          accessTokenExpiresAt: new Date(NOW + 30_000),
          scope: "offline_access search:docs:read",
        },
        KEY,
      ),
    )
    const { fetchImpl, calls } = createInspectingFetch([
      () => jsonResponse({ code: 20027, error: "invalid_grant" }),
      () => jsonResponse({ code: 0, tenant_access_token: "t-bot-token", expire: 7200 }),
      () =>
        jsonResponse({
          code: 0,
          data: {
            total: 1,
            has_more: false,
            res_units: [
              {
                title_highlighted: "应用可见文档",
                summary_highlighted: "bot 范围",
                entity_type: "WIKI",
                result_meta: { url: "https://feishu.cn/wiki/wik1", token: "wik1", doc_types: "DOCX" },
              },
            ],
          },
        }),
    ])
    const output = await executeFeishuKnowledgeTool(
      "feishu_knowledge_search",
      { query: "爆款选题" },
      {
        enabled: true,
        ...APP,
        encryptionKey: KEY,
        credentialStore: store,
        fetchImpl,
      },
    )
    expect(await store.loadActive()).toBeNull()
    expect(calls.some((call) => call.url.includes("tenant_access_token"))).toBe(true)
    expect(calls.some((call) => call.auth === `Bearer ${USER_ACCESS}`)).toBe(false)
    const parsed = JSON.parse(output) as { ok: boolean; results: Array<{ title: string }> }
    expect(parsed.ok).toBe(true)
    expect(parsed.results[0]?.title).toBe("应用可见文档")
    expect(output).not.toContain(USER_ACCESS)
    expect(output).not.toContain("t-bot-token")
  })
})

describe("feishu knowledge user identity search", () => {
  it("有用户身份时不换 tenant token，并带上个人云空间过滤", async () => {
    const { fetchImpl, calls } = createInspectingFetch([
      () =>
        jsonResponse({
          code: 0,
          data: {
            total: 1,
            has_more: false,
            res_units: [
              {
                title_highlighted: "私有文档",
                summary_highlighted: "仅用户可见",
                entity_type: "DOC",
                result_meta: { url: "https://feishu.cn/docx/dox1", token: "dox1", doc_types: "DOCX" },
              },
            ],
          },
        }),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      userAccessToken: USER_ACCESS,
      fetchImpl,
    })
    const hits = await client.search("选题")
    expect(calls.some((call) => call.url.includes("tenant_access_token"))).toBe(false)
    expect(calls[0]?.auth).toBe(`Bearer ${USER_ACCESS}`)
    expect(calls[0]?.body).toMatchObject({ doc_filter: { doc_types: ["DOCX", "DOC"] } })
    expect(hits[0]?.title).toBe("私有文档")
  })
})
