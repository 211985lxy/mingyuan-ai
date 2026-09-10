/**
 * 运营者飞书凭证：加密读写、到期刷新、撤销后回退机器人身份。
 */

import { FeishuKnowledgeError } from "./feishu-knowledge-client"
import { FeishuSecretEncryptionError, decryptFeishuSecret, encryptFeishuSecret } from "./feishu-knowledge-crypto"
import {
  isFeishuUserTokenRevoked,
  refreshFeishuUserAccessToken,
  type FeishuUserTokenSet,
} from "./feishu-knowledge-auth"

const ACCESS_REFRESH_AHEAD_MS = 120_000

export interface FeishuOperatorCredentialRecord {
  encryptedAccessToken: string
  encryptedRefreshToken: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt?: Date | null
  scope: string
  status: string
}

export interface FeishuOperatorCredentialStore {
  loadActive(): Promise<FeishuOperatorCredentialRecord | null>
  save(record: FeishuOperatorCredentialRecord): Promise<void>
  markRevoked(): Promise<void>
}

export function toEncryptedOperatorRecord(
  tokens: FeishuUserTokenSet,
  encryptionKey: string,
): FeishuOperatorCredentialRecord {
  return {
    encryptedAccessToken: encryptFeishuSecret(tokens.accessToken, encryptionKey),
    encryptedRefreshToken: encryptFeishuSecret(tokens.refreshToken, encryptionKey),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
    scope: tokens.scope,
    status: "active",
  }
}

export function createMemoryFeishuOperatorCredentialStore(
  seed?: FeishuOperatorCredentialRecord | null,
): FeishuOperatorCredentialStore {
  let current = seed ?? null
  return {
    async loadActive() {
      return current?.status === "active" ? { ...current } : null
    },
    async save(record) {
      current = { ...record, status: "active" }
    },
    async markRevoked() {
      if (current) current = { ...current, status: "revoked" }
    },
  }
}

export async function resolveKnowledgeUserAccessToken(input: {
  appId: string
  appSecret: string
  encryptionKey?: string
  fetchImpl?: typeof fetch
  now?: () => number
  store: FeishuOperatorCredentialStore
}): Promise<string | undefined> {
  const record = await input.store.loadActive()
  if (!record || record.status !== "active") return undefined
  if (!input.encryptionKey) {
    throw new FeishuKnowledgeError(
      "api_failure",
      "已有飞书运营者授权，但缺少加密密钥，无法读取用户身份。",
      "配置 FEISHU_TOKEN_ENCRYPTION_KEY 后重试，或重新完成飞书授权。",
    )
  }
  const now = input.now ?? Date.now
  try {
    const accessToken = decryptFeishuSecret(record.encryptedAccessToken, input.encryptionKey)
    if (record.accessTokenExpiresAt.getTime() - ACCESS_REFRESH_AHEAD_MS > now()) {
      return accessToken
    }
    return await refreshAndPersist(input, record)
  } catch (error) {
    if (error instanceof FeishuKnowledgeError) throw error
    if (error instanceof FeishuSecretEncryptionError) {
      throw new FeishuKnowledgeError("api_failure", error.message, "检查 FEISHU_TOKEN_ENCRYPTION_KEY 是否与落库时一致。")
    }
    if ((error as { revoked?: boolean }).revoked || isRevokedError(error)) {
      await input.store.markRevoked()
      return undefined
    }
    throw new FeishuKnowledgeError(
      "api_failure",
      error instanceof Error ? error.message : "飞书用户身份刷新失败",
      "重新打开飞书知识授权，或暂时回退为应用可见范围。",
    )
  }
}

async function refreshAndPersist(
  input: {
    appId: string
    appSecret: string
    encryptionKey?: string
    fetchImpl?: typeof fetch
    now?: () => number
    store: FeishuOperatorCredentialStore
  },
  record: FeishuOperatorCredentialRecord,
): Promise<string | undefined> {
  const encryptionKey = input.encryptionKey as string
  const refreshToken = decryptFeishuSecret(record.encryptedRefreshToken, encryptionKey)
  try {
    const tokens = await refreshFeishuUserAccessToken({
      appId: input.appId,
      appSecret: input.appSecret,
      refreshToken,
      fetchImpl: input.fetchImpl,
      now: input.now,
    })
    await input.store.save(toEncryptedOperatorRecord(tokens, encryptionKey))
    return tokens.accessToken
  } catch (error) {
    if ((error as { revoked?: boolean }).revoked || isRevokedError(error)) {
      await input.store.markRevoked()
      return undefined
    }
    throw error
  }
}

function isRevokedError(error: unknown): boolean {
  const code = (error as { feishuCode?: number }).feishuCode
  const message = error instanceof Error ? error.message : String(error)
  return isFeishuUserTokenRevoked(code, message)
}
