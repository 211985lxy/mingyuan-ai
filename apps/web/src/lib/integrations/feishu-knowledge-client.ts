/**
 * 飞书知识检索：search v2 + docx 正文。应用身份走 tenant token；有运营者授权则改用 user token。
 */

import { clearFeishuTenantTokenCache, getFeishuTenantAccessToken } from "./feishu-knowledge-auth"

const SEARCH_URL = "https://open.feishu.cn/open-apis/search/v2/doc_wiki/search"
const WIKI_NODE_URL = "https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node"
const SEARCH_QUERY_MAX = 30
const SEARCH_PAGE_SIZE = 10
const WIKI_NODE_CAP = 80

export type FeishuKnowledgeErrorKind =
  | "disabled"
  | "invalid_input"
  | "permission_denied"
  | "empty"
  | "api_failure"
  | "unsupported_doc"

export type FeishuKnowledgeEntityType = "DOC" | "WIKI"

export interface FeishuKnowledgeHit {
  title: string
  summary: string
  url: string
  token: string
  entityType: FeishuKnowledgeEntityType
  docType?: string
}

export interface FeishuDocContent {
  title: string
  url: string
  token: string
  objToken: string
  objType: string
  content: string
}

export interface FeishuKnowledgeClientConfig {
  appId: string
  appSecret: string
  wikiSpaceIds?: string[]
  userAccessToken?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export interface FeishuKnowledgeClient {
  search: (query: string) => Promise<FeishuKnowledgeHit[]>
  read: (token: string) => Promise<FeishuDocContent>
}

type JsonRecord = Record<string, unknown>

export class FeishuKnowledgeError extends Error {
  readonly kind: FeishuKnowledgeErrorKind
  readonly nextAction: string
  readonly code?: number

  constructor(kind: FeishuKnowledgeErrorKind, message: string, nextAction: string, code?: number) {
    super(message)
    this.name = "FeishuKnowledgeError"
    this.kind = kind
    this.nextAction = nextAction
    this.code = code
  }
}

export function isFeishuKnowledgeEnabled(value?: string | null): boolean {
  return value?.trim().toLowerCase() === "true"
}

export function parseWikiSpaceIds(value?: string | null): string[] {
  return (value ?? "")
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function clearFeishuKnowledgeTokenCache() {
  clearFeishuTenantTokenCache()
}

export function createFeishuKnowledgeClient(config: FeishuKnowledgeClientConfig): FeishuKnowledgeClient {
  const fetcher = config.fetchImpl ?? fetch
  const wikiSpaceIds = config.wikiSpaceIds ?? []
  const now = config.now ?? Date.now
  return {
    search: (query) => searchKnowledge({ config, fetcher, wikiSpaceIds, now, query }),
    read: (token) => readKnowledgeDoc({ config, fetcher, now, token }),
  }
}

async function searchKnowledge(input: {
  config: FeishuKnowledgeClientConfig
  fetcher: typeof fetch
  wikiSpaceIds: string[]
  now: () => number
  query: string
}): Promise<FeishuKnowledgeHit[]> {
  const token = await resolveRequestToken(input.config, input.fetcher, input.now)
  const query = input.query.slice(0, SEARCH_QUERY_MAX)
  const usingUser = Boolean(input.config.userAccessToken?.trim())
  // bot 身份统一搜索（search v2）仅支持用户身份，直接走知识库空间遍历降级
  if (!usingUser && input.wikiSpaceIds.length > 0) {
    return searchWikiNodes(input, token, query)
  }
  const payload = await feishuJson(input.fetcher, SEARCH_URL, {
    method: "POST",
    token,
    body: {
      query,
      ...(usingUser ? { doc_filter: { doc_types: ["DOCX", "DOC"] } } : {}),
      wiki_filter: {
        ...(input.wikiSpaceIds.length > 0 ? { space_ids: input.wikiSpaceIds } : {}),
        doc_types: ["DOCX", "DOC", "WIKI"],
      },
      page_size: SEARCH_PAGE_SIZE,
    },
  })
  if (isUserIdentityRequired(readNumber(payload.code), readString(payload.msg))) {
    return searchWikiNodes(input, token, query)
  }
  assertFeishuOk(payload, "飞书知识检索失败", "检查应用是否开通 search:docs:read，并把知识库空间授权给应用。")
  const units = asArray(asRecord(payload.data)?.res_units)
  const hits = units.map(mapSearchUnit).filter((hit): hit is FeishuKnowledgeHit => Boolean(hit))
  if (hits.length === 0) {
    throw new FeishuKnowledgeError(
      "empty",
      "飞书知识库未命中相关文档。",
      "确认授权 wiki 空间里有这篇内容，或换个更短的关键词。",
    )
  }
  return hits
}

async function searchWikiNodes(
  input: {
    config: FeishuKnowledgeClientConfig
    fetcher: typeof fetch
    wikiSpaceIds: string[]
  },
  token: string,
  query: string,
): Promise<FeishuKnowledgeHit[]> {
  if (input.wikiSpaceIds.length === 0) {
    throw new FeishuKnowledgeError(
      "api_failure",
      "统一搜索需要用户身份，且未配置 wiki 空间白名单，无法降级遍历。",
      "配置 FEISHU_KNOWLEDGE_WIKI_SPACE_IDS，或完成飞书知识授权后再搜个人云空间。",
    )
  }
  const needle = query.toLowerCase()
  const hits: FeishuKnowledgeHit[] = []
  for (const spaceId of input.wikiSpaceIds) {
    const nodes = await listWikiNodes(input.fetcher, token, spaceId)
    for (const node of nodes) {
      if (!node.title.toLowerCase().includes(needle)) continue
      hits.push({
        title: node.title,
        summary: "",
        url: wikiUrl(node.nodeToken),
        token: node.nodeToken,
        entityType: "WIKI",
        docType: node.objType.toUpperCase(),
      })
    }
  }
  if (hits.length === 0) {
    throw new FeishuKnowledgeError(
      "empty",
      "授权 wiki 空间里没有标题匹配的文档。",
      "确认空间已授权给应用，且文档标题包含检索词。",
    )
  }
  return hits
}

async function readKnowledgeDoc(input: {
  config: FeishuKnowledgeClientConfig
  fetcher: typeof fetch
  now: () => number
  token: string
}): Promise<FeishuDocContent> {
  const accessToken = await resolveRequestToken(input.config, input.fetcher, input.now)
  const node = await getWikiNode(input.fetcher, accessToken, input.token)
  if (node.objType !== "docx" && node.objType !== "doc") {
    throw new FeishuKnowledgeError(
      "unsupported_doc",
      `暂不支持读取 ${node.objType || "未知"} 类型文档。`,
      "请选择飞书云文档（docx）再读正文。",
    )
  }
  if (node.objType === "doc") {
    throw new FeishuKnowledgeError(
      "unsupported_doc",
      "旧版 doc 不支持 raw_content 读取。",
      "把文档升级为新版云文档后再试。",
    )
  }
  const payload = await feishuJson(
    input.fetcher,
    `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(node.objToken)}/raw_content`,
    { method: "GET", token: accessToken },
  )
  assertFeishuOk(payload, "飞书文档正文读取失败", "确认应用有该文档阅读权限，并开通 docx:document:readonly。")
  const content = readString(asRecord(payload.data)?.content)
  if (!content.trim()) {
    throw new FeishuKnowledgeError("empty", "文档正文为空。", "打开飞书确认该文档有内容后再读。")
  }
  return {
    title: node.title,
    url: wikiUrl(node.nodeToken) || docxUrl(node.objToken),
    token: node.nodeToken || input.token,
    objToken: node.objToken,
    objType: node.objType,
    content,
  }
}

async function resolveRequestToken(
  config: FeishuKnowledgeClientConfig,
  fetcher: typeof fetch,
  now: () => number,
): Promise<string> {
  const user = config.userAccessToken?.trim()
  if (user) return user
  try {
    return await getFeishuTenantAccessToken({
      appId: config.appId,
      appSecret: config.appSecret,
      fetchImpl: fetcher,
      now,
    })
  } catch (error) {
    throw new FeishuKnowledgeError(
      "api_failure",
      error instanceof Error ? error.message : "飞书 tenant_access_token 获取失败",
      "检查 FEISHU_APP_ID / FEISHU_APP_SECRET 是否属于已发布的自建应用。",
    )
  }
}

async function getWikiNode(fetcher: typeof fetch, accessToken: string, token: string) {
  const objType = inferObjType(token)
  const url = `${WIKI_NODE_URL}?token=${encodeURIComponent(token)}&obj_type=${encodeURIComponent(objType)}`
  const payload = await feishuJson(fetcher, url, { method: "GET", token: accessToken })
  assertFeishuOk(payload, "飞书知识库节点解析失败", "把该 wiki 空间或文档授权给应用，并开通 wiki:node:read。")
  const node = asRecord(asRecord(payload.data)?.node)
  const objToken = readString(node?.obj_token)
  const objTypeValue = readString(node?.obj_type) || "docx"
  if (!objToken) {
    throw new FeishuKnowledgeError("api_failure", "知识库节点没有可读取的文档 token。", "换一篇云文档再试。")
  }
  return {
    title: readString(node?.title),
    nodeToken: readString(node?.node_token) || token,
    objToken,
    objType: objTypeValue,
  }
}

async function listWikiNodes(fetcher: typeof fetch, accessToken: string, spaceId: string) {
  const collected: Array<{ title: string; nodeToken: string; objType: string }> = []
  const queue: Array<{ parent?: string }> = [{}]
  while (queue.length > 0 && collected.length < WIKI_NODE_CAP) {
    const current = queue.shift()
    if (!current) break
    const params = new URLSearchParams({ page_size: "50" })
    if (current.parent) params.set("parent_node_token", current.parent)
    const payload = await feishuJson(
      fetcher,
      `https://open.feishu.cn/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes?${params.toString()}`,
      { method: "GET", token: accessToken },
    )
    assertFeishuOk(payload, "飞书知识库空间遍历失败", "把该 wiki 空间授权给应用，并开通 wiki:wiki:readonly。")
    const items = asArray(asRecord(payload.data)?.items)
    for (const item of items) {
      const record = asRecord(item)
      if (!record) continue
      const nodeToken = readString(record.node_token)
      const title = readString(record.title)
      if (nodeToken && title) {
        collected.push({
          title,
          nodeToken,
          objType: readString(record.obj_type) || "docx",
        })
      }
      if (record.has_child === true && nodeToken) queue.push({ parent: nodeToken })
    }
  }
  return collected
}

async function feishuJson(
  fetcher: typeof fetch,
  url: string,
  input: { method: string; token?: string; body?: JsonRecord },
): Promise<JsonRecord> {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" }
  if (input.token) headers.Authorization = `Bearer ${input.token}`
  const response = await fetcher(url, {
    method: input.method,
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const payload = (await response.json()) as JsonRecord
  return {
    ...payload,
    httpOk: response.ok,
  }
}

function mapSearchUnit(value: unknown): FeishuKnowledgeHit | null {
  const unit = asRecord(value)
  const meta = asRecord(unit?.result_meta)
  const token = readString(meta?.token)
  if (!unit || !meta || !token) return null
  const entityType = readString(unit.entity_type) === "WIKI" ? "WIKI" : "DOC"
  return {
    title: stripHighlight(unit.title_highlighted) || token,
    summary: stripHighlight(unit.summary_highlighted),
    url: readString(meta.url),
    token,
    entityType,
    docType: readString(meta.doc_types) || undefined,
  }
}

function assertFeishuOk(payload: JsonRecord, fallbackMessage: string, nextAction: string) {
  const code = typeof payload.code === "number" ? payload.code : undefined
  const msg = readString(payload.msg) || fallbackMessage
  if (payload.httpOk === false || (code !== undefined && code !== 0)) {
    throw new FeishuKnowledgeError(classifyFeishuError(code, msg), msg, nextActionFor(code, msg, nextAction), code)
  }
}

function classifyFeishuError(code?: number, msg = ""): FeishuKnowledgeErrorKind {
  const text = msg.toLowerCase()
  if (
    code === 131006
    || code === 99991663
    || code === 1770032
    || text.includes("permission")
    || text.includes("scope")
    || text.includes("forbidden")
    || msg.includes("权限")
  ) {
    return "permission_denied"
  }
  return "api_failure"
}

function nextActionFor(code: number | undefined, msg: string, fallback: string) {
  if (classifyFeishuError(code, msg) === "permission_denied") {
    return "把知识库空间/文档授权给应用，并开通 search:docs:read、wiki:node:read、docx:document:readonly。"
  }
  return fallback
}

function isUserIdentityRequired(code?: number, msg?: string) {
  if (code === 1274011) return true
  return (msg ?? "").toLowerCase().includes("user_access_token")
}

function inferObjType(token: string) {
  if (token.startsWith("dox")) return "docx"
  if (token.startsWith("doc")) return "doc"
  return "wiki"
}

function stripHighlight(value: unknown) {
  return readString(value).replace(/<\/?h>/gi, "").replace(/<[^>]+>/g, "").trim()
}

function wikiUrl(token: string) {
  return token ? `https://feishu.cn/wiki/${token}` : ""
}

function docxUrl(token: string) {
  return token ? `https://feishu.cn/docx/${token}` : ""
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}
