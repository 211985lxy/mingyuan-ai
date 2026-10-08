/**
 * AIM 的 Streamable HTTP（无状态 JSON）。
 * 有效的 maim_ Key 才能 initialize 和列出工具。不保存会话。
 */

import { z } from "zod"

import type { AimMcpToolExtra, AimMcpToolResult, AimMcpToolServer } from "./mcp-tool-server"

const DEFAULT_PROTOCOL = "2025-03-26"
const KNOWN_PROTOCOLS = new Set(["2025-03-26", "2024-11-05"])

interface JsonRpcRequest {
  jsonrpc: string
  id?: string | number | null
  method: string
  params?: unknown
}

interface RegisteredTool {
  name: string
  title?: string
  description: string
  annotations?: { readOnlyHint?: boolean }
  shape?: z.ZodRawShape
  takesArgs: boolean
  handler: (argsOrExtra: unknown, extra?: AimMcpToolExtra) => Promise<AimMcpToolResult>
}

interface HandlerOptions {
  verifyToken: (request: Request, bearerToken?: string) => Promise<unknown>
  serverInfo: { name: string; version: string }
  instructions: string
  tools: Map<string, RegisteredTool>
}

export function createAimMcpHttpHandler(options: {
  register: (server: AimMcpToolServer) => void
  verifyToken: (request: Request, bearerToken?: string) => Promise<unknown>
  serverInfo: { name: string; version: string }
  instructions: string
}): (request: Request) => Promise<Response> {
  const tools = new Map<string, RegisteredTool>()
  options.register(createRegistry(tools))
  return (request) => handleAimMcpHttp(request, { ...options, tools })
}

function createRegistry(tools: Map<string, RegisteredTool>): AimMcpToolServer {
  const registerTool = (
    name: string,
    config: {
      title?: string
      description?: string
      annotations?: { readOnlyHint?: boolean }
      inputSchema?: z.ZodRawShape
    },
    handler: RegisteredTool["handler"],
  ) => {
    tools.set(name, {
      name,
      title: config.title,
      description: config.description ?? "",
      annotations: config.annotations,
      shape: config.inputSchema,
      takesArgs: Boolean(config.inputSchema),
      handler,
    })
  }
  return { registerTool } as AimMcpToolServer
}

export async function handleAimMcpHttp(request: Request, options: HandlerOptions): Promise<Response> {
  const auth = await authorize(request, options.verifyToken)
  if (!auth.ok) return auth.response
  if (request.method !== "POST") {
    return json({
      error: "Method Not Allowed",
      message: "请用 POST 发送 JSON-RPC。initialize 和 tools/list 都走这一条地址。",
    }, 405)
  }
  const parsed = await readJsonRpc(request)
  if (!parsed.ok) return parsed.response
  return dispatch(parsed.message, auth.authInfo, options)
}

async function authorize(
  request: Request,
  verifyToken: HandlerOptions["verifyToken"],
): Promise<{ ok: true; authInfo: unknown } | { ok: false; response: Response }> {
  try {
    const authInfo = await verifyToken(request, readBearer(request))
    if (authInfo) return { ok: true, authInfo }
  } catch {
    // 鉴权失败只告诉客户端钥匙无效，不把内部错误原文吐出去。
  }
  return {
    ok: false,
    response: json({ error: "Unauthorized", message: "需要有效的 maim_ Bearer Key" }, 401),
  }
}

function readBearer(request: Request): string | undefined {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return undefined
  return auth.slice(7).trim() || undefined
}

async function readJsonRpc(
  request: Request,
): Promise<{ ok: true; message: JsonRpcRequest } | { ok: false; response: Response }> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return { ok: false, response: rpcError(null, -32700, "请求不是合法 JSON") }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, response: rpcError(null, -32600, "只接受单条 JSON-RPC 请求") }
  }
  const message = payload as Partial<JsonRpcRequest>
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return { ok: false, response: rpcError(message.id ?? null, -32600, "不是合法的 JSON-RPC 2.0 请求") }
  }
  return { ok: true, message: message as JsonRpcRequest }
}

async function dispatch(message: JsonRpcRequest, authInfo: unknown, options: HandlerOptions): Promise<Response> {
  if (message.id == null && message.method.startsWith("notifications/")) {
    return new Response(null, { status: 202 })
  }
  if (message.method === "initialize") return rpcResult(message.id, initializeResult(message.params, options))
  if (message.method === "ping") return rpcResult(message.id ?? null, {})
  if (message.method === "tools/list") return rpcResult(message.id ?? null, { tools: listTools(options.tools) })
  if (message.method === "tools/call") return rpcResult(message.id ?? null, await callTool(message.params, authInfo, options.tools))
  return rpcError(message.id ?? null, -32601, `不支持的方法：${message.method}`)
}

function initializeResult(params: unknown, options: HandlerOptions) {
  const requested = params && typeof params === "object" && "protocolVersion" in params
    ? String((params as { protocolVersion?: unknown }).protocolVersion ?? "")
    : ""
  return {
    protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: options.serverInfo,
    instructions: options.instructions,
  }
}

function listTools(tools: Map<string, RegisteredTool>) {
  return [...tools.values()].map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: jsonSchemaFromShape(tool.shape),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  }))
}

async function callTool(params: unknown, authInfo: unknown, tools: Map<string, RegisteredTool>): Promise<AimMcpToolResult> {
  const name = params && typeof params === "object" && "name" in params ? String((params as { name?: unknown }).name ?? "") : ""
  const tool = tools.get(name)
  if (!tool) {
    return toolText(`没有「${name || "未命名"}」这个工具。作品编辑请用 aim_work_editor_start。发布、写飞书、改知识库、改营销全案都不提供。`, true)
  }
  const args = params && typeof params === "object" && "arguments" in params
    ? (params as { arguments?: unknown }).arguments
    : {}
  try {
    if (!tool.takesArgs) return await tool.handler({ authInfo })
    const parsed = z.object(tool.shape ?? {}).safeParse(args ?? {})
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "参数"}：${issue.message}`).join("；")
      return toolText(`参数不对。${detail}`, true)
    }
    return await tool.handler(parsed.data, { authInfo })
  } catch (error) {
    return toolText(toolFailureMessage(error), true)
  }
}

function toolFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : ""
  if (code === "AGENT_PROJECT_FORBIDDEN") return "没有这个项目的权限，或账号还没绑定项目。"
  if (code === "AGENT_AGENT_FORBIDDEN") return "这个 Key 不能调用该智能体。"
  if (code === "SCOPE_DENIED") return "这个 Key 没有对应操作权限。"
  return "工具执行失败。请换一个允许的动作重试。"
}

function toolText(text: string, isError: boolean): AimMcpToolResult {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) }
}

function jsonSchemaFromShape(shape: z.ZodRawShape | undefined): Record<string, unknown> {
  if (!shape) return { type: "object", properties: {}, additionalProperties: false }
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, schema] of Object.entries(shape)) {
    const field = schema as z.ZodTypeAny
    const optional = field._def.typeName === "ZodOptional"
    properties[key] = jsonSchemaFromZod(optional ? field._def.innerType as z.ZodTypeAny : field)
    if (!optional) required.push(key)
  }
  return { type: "object", properties, required, additionalProperties: false }
}

function jsonSchemaFromZod(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def
  if (def.typeName === "ZodString") return stringSchema(def.checks)
  if (def.typeName === "ZodEnum") return { type: "string", enum: def.values }
  if (def.typeName === "ZodArray" && def.type) {
    const out: Record<string, unknown> = { type: "array", items: jsonSchemaFromZod(def.type) }
    if (def.minLength?.value != null) out.minItems = def.minLength.value
    if (def.maxLength?.value != null) out.maxItems = def.maxLength.value
    return out
  }
  return {}
}

function stringSchema(checks: Array<{ kind: string; value: number }> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { type: "string" }
  for (const check of checks ?? []) {
    if (check.kind === "min") out.minLength = check.value
    if (check.kind === "max") out.maxLength = check.value
  }
  return out
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, result })
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string): Response {
  const status = code === -32700 || code === -32600 ? 400 : 200
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}
