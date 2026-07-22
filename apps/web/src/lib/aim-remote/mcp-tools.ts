/**
 * MCP tool definitions for the AIM remote capability surface.
 *
 * Four tools, matching the REST surface:
 * - aim_capabilities    (capabilities.read)
 * - aim_projects_list   (projects.read)
 * - aim_draft_submit    (drafts.submit)   — requires idempotencyKey
 * - aim_invocation_get  (invocations.read)
 *
 * Tools call the shared domain service (invocation-service.ts) directly — they
 * do NOT re-invoke internal REST over HTTP. Each tool resolves the caller's
 * AgentApiContext from extra.authInfo (set by withMcpAuth's verifyToken).
 */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { buildAgentCapabilities } from "@/lib/agent-api-contract"
import { assertAgentScope } from "@/lib/agent-api-auth"
import { submitInvocation, getInvocation } from "./invocation-service"
import {
  AGENT_SCOPE,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MAX_INSTRUCTION_CHARS,
  MAX_RAW_INPUT_CHARS,
  MAX_TARGET_FORMATS,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  MIN_TARGET_FORMATS,
  REMOTE_ERROR_CODE,
  remoteErrorStatus,
} from "./contracts"
import { loadContextForApiKey, type AimMcpAuthInfo } from "./mcp-auth"
import { prisma } from "@/lib/prisma"

/** Shape of extra.authInfo after withMcpAuth resolved the token. */
function asAimAuth(authInfo: unknown): AimMcpAuthInfo | null {
  if (authInfo && typeof authInfo === "object" && "__aim" in authInfo && (authInfo as AimMcpAuthInfo).__aim === true) {
    return authInfo as AimMcpAuthInfo
  }
  return null
}

/** Resolve the AgentApiContext from the MCP auth info, or throw a tool error. */
async function requireContext(authInfo: unknown) {
  const aim = asAimAuth(authInfo)
  if (!aim) {
    return { ok: false as const, error: toolError("未通过鉴权（缺少有效的 maim_ Key）", REMOTE_ERROR_CODE.KEY_DISABLED) }
  }
  const context = await loadContextForApiKey(aim.apiKeyId)
  if (!context) {
    return { ok: false as const, error: toolError("API Key 已停用或过期", REMOTE_ERROR_CODE.KEY_DISABLED) }
  }
  return { ok: true as const, context }
}

/** Build a structured MCP tool error result. */
function toolError(message: string, code: string) {
  return {
    content: [{ type: "text" as const, text: `${message}（code: ${code}）` }],
    isError: true,
  }
}

/** Build a successful MCP tool result with both short text and structured data. */
function toolSuccess(text: string, structured?: unknown) {
  const payload = structured == null ? text : `${text}\n\n${JSON.stringify(structured)}`
  return { content: [{ type: "text" as const, text: payload }] }
}

/**
 * Register the four AIM MCP tools on a McpServer instance.
 * The server is created by createMcpHandler in the route file.
 */
export function registerAimMcpTools(server: McpServer): void {
  // ── aim_capabilities ──
  server.registerTool(
    "aim_capabilities",
    {
      title: "AIM 能力清单",
      description: "查询可用智能体、目标格式和禁止动作。无需参数。",
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.capabilitiesRead)
      const capabilities = buildAgentCapabilities()
      return toolSuccess(
        `可用智能体 ${capabilities.agents.length} 个，目标格式 ${capabilities.targetFormats.length} 种。仅生成草稿，发布与正式知识写入需人工确认。`,
        capabilities,
      )
    },
  )

  // ── aim_projects_list ──
  server.registerTool(
    "aim_projects_list",
    {
      title: "授权项目列表",
      description: "查询当前 API Key 可访问的项目。",
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.projectsRead)
      const projects = await prisma.clientProject.findMany({
        where: { id: { in: resolved.context.allowedProjects }, status: "active" },
        select: { id: true, name: true },
      })
      return toolSuccess(`当前 Key 可访问 ${projects.length} 个项目`, { projects })
    },
  )

  // ── aim_draft_submit ──
  server.registerTool(
    "aim_draft_submit",
    {
      title: "提交草稿生成",
      description: "异步提交一次草稿生成任务。必须携带 idempotencyKey（相同键+相同请求不重复消耗 Token）。返回 invocationId 用于轮询。",
      inputSchema: {
        idempotencyKey: z.string().min(MIN_IDEMPOTENCY_KEY_LENGTH).max(MAX_IDEMPOTENCY_KEY_LENGTH),
        projectId: z.string().min(1).max(80),
        agentId: z.string().min(1).max(60),
        rawInput: z.string().min(1).max(MAX_RAW_INPUT_CHARS),
        targetFormats: z.array(z.string()).min(MIN_TARGET_FORMATS).max(MAX_TARGET_FORMATS),
        instruction: z.string().max(MAX_INSTRUCTION_CHARS).optional(),
        topicTitle: z.string().max(500).optional(),
        topicRationale: z.string().max(2000).optional(),
      },
    },
    async (args, extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.draftsSubmit)

      const result = await submitInvocation(resolved.context, {
        idempotencyKey: args.idempotencyKey,
        projectId: args.projectId,
        agentId: args.agentId as never,
        rawInput: args.rawInput,
        targetFormats: args.targetFormats as never,
        instruction: args.instruction,
        topicTitle: args.topicTitle,
        topicRationale: args.topicRationale,
      })
      if (!result.ok) {
        return toolError(result.errorMessage, result.errorCode)
      }
      const r = result.response
      return toolSuccess(
        `已${result.created ? "提交" : "返回已存在"}调用（幂等）。状态：${r.status}。${r.pollAfterSeconds}s 后可用 aim_invocation_get 轮询。`,
        { invocationId: r.invocationId, status: r.status, pollAfterSeconds: r.pollAfterSeconds, requiresHumanReview: true },
      )
    },
  )

  // ── aim_invocation_get ──
  server.registerTool(
    "aim_invocation_get",
    {
      title: "查询调用状态",
      description: "查询草稿生成的排队/运行/结果/错误与 Token 成本。只能读取当前 Key 自己创建的调用。",
      annotations: { readOnlyHint: true },
      inputSchema: {
        invocationId: z.string().min(1).max(60),
      },
    },
    async (args, extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.invocationsRead)

      const response = await getInvocation(resolved.context, args.invocationId)
      if (!response) {
        return toolError("调用不存在或无权读取", REMOTE_ERROR_CODE.INVOCATION_NOT_FOUND)
      }
      return toolSuccess(`调用 ${response.invocationId} 状态：${response.status}`, response)
    },
  )
}

// Re-export for the route file to assemble the handler.
export { remoteErrorStatus }
