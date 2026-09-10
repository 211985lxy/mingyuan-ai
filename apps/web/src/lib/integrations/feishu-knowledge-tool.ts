/**
 * 飞书知识工具执行器：入参校验、结果裁剪、结构化错误。
 * HTTP 细节在 feishu-knowledge-client.ts。
 */

import {
  FeishuKnowledgeError,
  createFeishuKnowledgeClient,
  type FeishuKnowledgeClient,
  type FeishuKnowledgeErrorKind,
} from "./feishu-knowledge-client"
import {
  resolveKnowledgeUserAccessToken,
  type FeishuOperatorCredentialStore,
} from "./feishu-knowledge-credentials"
import { createPrismaFeishuOperatorCredentialStore } from "./feishu-knowledge-credential-store"

const DOC_CONTENT_MAX = 3_500

export interface FeishuKnowledgeToolConfig {
  enabled: boolean
  appId?: string
  appSecret?: string
  wikiSpaceIds?: string[]
  encryptionKey?: string
  userAccessToken?: string
  fetchImpl?: typeof fetch
  client?: FeishuKnowledgeClient
  credentialStore?: FeishuOperatorCredentialStore
}

export async function executeFeishuKnowledgeTool(
  name: "feishu_knowledge_search" | "feishu_doc_read",
  args: Record<string, unknown>,
  config: FeishuKnowledgeToolConfig,
): Promise<string> {
  if (!config.enabled) {
    return toolError("disabled", "飞书知识检索未开启。", "将 FEISHU_KNOWLEDGE_ENABLED 设为 true 后重试。")
  }
  try {
    if (name === "feishu_knowledge_search") {
      const query = typeof args.query === "string" ? args.query.trim() : ""
      if (!query) {
        return toolError("invalid_input", "缺少搜索关键词。", "请传入 query，例如「爆款选题是什么」。")
      }
      const resolved = await resolveClient(config)
      const results = await resolved.client.search(query)
      return JSON.stringify({ ok: true, identity: resolved.identity, results: results.slice(0, 8) })
    }
    const token = typeof args.token === "string" ? args.token.trim() : ""
    if (!token) {
      return toolError("invalid_input", "缺少文档 token。", "请先调用 feishu_knowledge_search，再传入命中项的 token。")
    }
    const resolved = await resolveClient(config)
    const doc = await resolved.client.read(token)
    return JSON.stringify({
      ok: true,
      identity: resolved.identity,
      title: doc.title,
      url: doc.url,
      token: doc.token,
      objToken: doc.objToken,
      content: doc.content.slice(0, DOC_CONTENT_MAX),
    })
  } catch (error) {
    return serializeToolError(error)
  }
}

async function resolveClient(
  config: FeishuKnowledgeToolConfig,
): Promise<{ client: FeishuKnowledgeClient; identity: "user" | "bot" }> {
  if (config.client) {
    return { client: config.client, identity: config.userAccessToken?.trim() ? "user" : "bot" }
  }
  const appId = config.appId?.trim() ?? ""
  const appSecret = config.appSecret?.trim() ?? ""
  if (!appId || !appSecret) {
    throw new FeishuKnowledgeError(
      "api_failure",
      "飞书应用凭证未配置。",
      "在环境变量中配置 FEISHU_APP_ID 与 FEISHU_APP_SECRET 后重试。",
    )
  }
  const userAccessToken = config.userAccessToken?.trim()
    || await resolveKnowledgeUserAccessToken({
      appId,
      appSecret,
      encryptionKey: config.encryptionKey,
      fetchImpl: config.fetchImpl,
      store: config.credentialStore ?? createPrismaFeishuOperatorCredentialStore(),
    })
  return {
    identity: userAccessToken ? "user" : "bot",
    client: createFeishuKnowledgeClient({
      appId,
      appSecret,
      wikiSpaceIds: config.wikiSpaceIds,
      userAccessToken,
      fetchImpl: config.fetchImpl,
    }),
  }
}

function serializeToolError(error: unknown): string {
  if (error instanceof FeishuKnowledgeError) {
    return toolError(error.kind, error.message, error.nextAction)
  }
  const message = error instanceof Error ? error.message : String(error)
  return toolError("api_failure", message, "稍后重试；若持续失败，检查飞书接口与应用权限。")
}

function toolError(kind: FeishuKnowledgeErrorKind, message: string, nextAction: string) {
  return JSON.stringify({ ok: false, kind, message, nextAction })
}
