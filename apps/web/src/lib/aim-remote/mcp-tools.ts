/**
 * 公开 MCP 工具：和登录后的网页用同一套生成。
 * 不提供另一条只排队的交稿通道。
 */

import { z } from "zod"
import { buildAgentCapabilities } from "@/lib/agent-api-contract"
import { assertAgentAccess, assertAgentScope } from "@/lib/agent-api-auth"
import { getWorkflowStageForAgent } from "@/lib/aim-workflow"
import { getAimAgent, listVisibleAimAgents } from "@/lib/aim-ui-config"
import { prisma } from "@/lib/prisma"
import { AGENT_SCOPE, MAX_RAW_INPUT_CHARS, REMOTE_ERROR_CODE } from "./contracts"
import { loadContextForApiKey, type AimMcpAuthInfo } from "./mcp-auth"
import type { AimMcpToolServer } from "./mcp-tool-server"
import { listAimPageActions, stageTitle, type AimPageAction } from "./page-action-catalog"
import { emptyMaterialMessage, runAimPageJob } from "./page-action-run"

const materialSchema = {
  material: z.string().max(MAX_RAW_INPUT_CHARS).optional(),
  topicTitle: z.string().max(500).optional(),
}

function asAimAuth(authInfo: unknown): AimMcpAuthInfo | null {
  if (authInfo && typeof authInfo === "object" && "__aim" in authInfo && (authInfo as AimMcpAuthInfo).__aim === true) {
    return authInfo as AimMcpAuthInfo
  }
  return null
}

async function requireContext(authInfo: unknown) {
  const aim = asAimAuth(authInfo)
  if (!aim) return { ok: false as const, error: toolError("未通过鉴权（缺少有效的 maim_ Key）", REMOTE_ERROR_CODE.KEY_DISABLED) }
  const context = await loadContextForApiKey(aim.apiKeyId)
  if (!context) return { ok: false as const, error: toolError("API Key 已停用或过期", REMOTE_ERROR_CODE.KEY_DISABLED) }
  return { ok: true as const, context }
}

function toolError(message: string, code: string) {
  return { content: [{ type: "text" as const, text: `${message}（code: ${code}）` }], isError: true }
}

function toolSuccess(text: string, structured?: unknown) {
  const payload = structured == null ? text : `${text}\n\n${JSON.stringify(structured)}`
  return { content: [{ type: "text" as const, text: payload }] }
}

export function registerAimMcpTools(server: AimMcpToolServer): void {
  registerCapabilityTool(server)
  registerProjectTool(server)
  registerStartTool(server)
  for (const action of listAimPageActions()) registerActionTool(server, action)
}

function registerCapabilityTool(server: AimMcpToolServer) {
  server.registerTool(
    "aim_capabilities",
    {
      title: "AIM 能力清单",
      description: "查询网页上能做的阶段、智能体和动作，以及明确不做的事。",
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.capabilitiesRead)
      const actions = listAimPageActions().map((action) => ({
        tool: action.toolName,
        title: action.title,
        stage: stageTitle(action.stage),
        agentId: action.agentId,
        mode: action.mode,
      }))
      return toolSuccess(
        "这些动作和网页是同一套。用对应工具，或用 aim_start 指定智能体。不会发布、不会写飞书、不会改知识库、不会改营销全案。没素材、没项目、跑完没正文，都算失败。",
        { ...buildAgentCapabilities(), actions },
      )
    },
  )
}

function registerProjectTool(server: AimMcpToolServer) {
  server.registerTool(
    "aim_projects_list",
    {
      title: "授权项目列表",
      description: "查询当前 API Key 可访问的项目。没有项目会失败。",
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      const resolved = await requireContext(extra.authInfo)
      if (!resolved.ok) return resolved.error
      assertAgentScope(resolved.context, AGENT_SCOPE.projectsRead)
      if (resolved.context.allowedProjects.length === 0) {
        return toolError("还没有可编辑的项目。请先在账号里绑定 IP 营销全案。空列表不算成功。", "NO_BOUND_PROJECT")
      }
      const projects = await prisma.clientProject.findMany({
        where: { id: { in: resolved.context.allowedProjects }, status: "active" },
        take: resolved.context.allowedProjects.length,
        select: { id: true, name: true },
      })
      if (projects.length === 0) {
        return toolError("还没有可编辑的项目。请先在账号里绑定 IP 营销全案。空列表不算成功。", "NO_BOUND_PROJECT")
      }
      return toolSuccess(`当前 Key 可访问 ${projects.length} 个项目`, { projects })
    },
  )
}

function registerStartTool(server: AimMcpToolServer) {
  const agents = listVisibleAimAgents()
  const ids = agents.map((agent) => agent.id) as [string, ...string[]]
  server.registerTool(
    "aim_start",
    {
      title: "按智能体开工",
      description: "对应网页上选中一个智能体后点开始。agent 用 business_system_diagnosis、business_diagnosis、content_producer、work_editor、content_retro。material 是你要交给它的正文或素材。",
      inputSchema: { ...materialSchema, agent: z.enum(ids) },
    },
    async (args, extra) => {
      const agent = getAimAgent(args.agent)
      const stage = getWorkflowStageForAgent(agent.id)
      return runRegisteredAction({
        toolName: "aim_start",
        title: agent.title,
        description: agent.description,
        stage,
        agentId: agent.id,
        mode: "run",
        materialNoun: stage === "publish" ? "成稿" : "素材",
      }, args, extra.authInfo)
    },
  )
}

function registerActionTool(server: AimMcpToolServer, action: AimPageAction) {
  server.registerTool(
    action.toolName,
    {
      title: action.title,
      description: action.description,
      inputSchema: materialSchema,
    },
    async (args, extra) => runRegisteredAction(action, args, extra.authInfo),
  )
}

async function runRegisteredAction(
  action: AimPageAction,
  args: { material?: string; topicTitle?: string },
  authInfo: unknown,
) {
  const resolved = await requireContext(authInfo)
  if (!resolved.ok) return resolved.error
  assertAgentScope(resolved.context, action.mode === "run" ? AGENT_SCOPE.draftsSubmit : AGENT_SCOPE.capabilitiesRead)
  if (action.mode === "refuse") return toolError(action.refusal || "不允许。", "FORBIDDEN")
  if (action.mode === "page_only") return toolError(action.refusal || "这个动作要在网页里做。", "PAGE_ONLY")
  const material = args.material?.trim() ?? ""
  if (!material) return toolError(emptyMaterialMessage(action), "EMPTY_MATERIAL")
  if (!action.agentId) return toolError("这个动作没有对应的智能体。", "INVALID_REQUEST")
  assertAgentAccess(resolved.context, action.agentId)
  const outcome = await runAimPageJob(resolved.context.userId, action, material, args.topicTitle)
  if (!outcome.ok) return toolError(outcome.message, outcome.code)
  return toolSuccess(outcome.text)
}
