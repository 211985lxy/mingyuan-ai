/**
 * 作品编辑（发作品阶段）的远程入口。
 * 只改已有成稿，或做发布前检查。不会发布，也不会写飞书、改知识库、改营销全案。
 */

import { createHash } from "node:crypto"

import type { AgentApiContext } from "@/lib/agent-api-auth"
import { REVIEW_SKILLS, WORK_EDITOR_SKILLS } from "@/lib/aim-agent-skills"
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import type { ContentFormat } from "@/lib/aim-generator"

import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MAX_RAW_INPUT_CHARS,
  MIN_IDEMPOTENCY_KEY_LENGTH,
  type AgentInvocationResponse,
} from "./contracts"
import { submitInvocation } from "./invocation-service"

export const WORK_EDITOR_STAGE = "publish"

const STAGE_SKILLS = [...WORK_EDITOR_SKILLS, ...REVIEW_SKILLS]
const DRAFT_BOUNDARY = "只交付草稿或质检意见。不要宣称已经发布，不要写飞书，不要改知识库，不要改 IP 营销全案。"

export const FORBIDDEN_MCP_ACTIONS = [
  { id: "publish", message: "不允许自动发布。作品编辑只改草稿、做发布前检查，真正发出去要人在页面上确认。" },
  { id: "feishu_write", message: "不允许写入飞书。这一版只在 AIM 里留草稿。" },
  { id: "knowledge_edit", message: "不允许修改知识库。" },
  { id: "ip_plan_edit", message: "不允许修改 IP 营销全案。" },
] as const

export function listWorkEditorActions() {
  return STAGE_SKILLS.map((skill) => ({
    id: skill.id,
    label: skill.label,
    description: skill.description,
    agentId: skill.agentId,
  }))
}

export function describeWorkEditorSurface() {
  return {
    stage: WORK_EDITOR_STAGE,
    page: "/aim?agent=work_editor&stage=publish",
    tool: "aim_work_editor_start",
    actions: listWorkEditorActions(),
    denied: FORBIDDEN_MCP_ACTIONS.map((item) => ({ id: item.id, message: item.message })),
  }
}

export function forbiddenMcpMessage(action: string): string | null {
  return FORBIDDEN_MCP_ACTIONS.find((item) => item.id === action)?.message ?? null
}

export function resolveWorkEditorProjectId(
  context: Pick<AgentApiContext, "boundProjectId" | "allowedProjects">,
): string | null {
  const bound = context.boundProjectId?.trim()
  if (bound) return bound
  if (context.boundProjectId === null) return null
  if (context.allowedProjects.length === 1) return context.allowedProjects[0] ?? null
  return null
}

export function workEditorIdempotencyKey(projectId: string, action: string, draft: string): string {
  return createHash("sha256").update(`${projectId}\n${action}\n${draft}`).digest("hex").slice(0, 40)
}

export interface WorkEditorStartInput {
  action: string
  draft?: string
  idempotencyKey?: string
  topicTitle?: string
}

export interface WorkEditorSubmission {
  idempotencyKey: string
  projectId: string
  agentId: AimAgentId
  rawInput: string
  targetFormats: ContentFormat[]
  instruction: string
  topicTitle?: string
}

function targetFormatsFor(action: string): ContentFormat[] {
  return action === "wechat_layout" ? ["wechat_article"] : ["raw_copy"]
}

export function buildWorkEditorSubmission(
  context: Pick<AgentApiContext, "boundProjectId" | "allowedProjects">,
  input: WorkEditorStartInput,
): { ok: true; label: string; submission: WorkEditorSubmission } | { ok: false; message: string } {
  const denied = forbiddenMcpMessage(input.action)
  if (denied) return { ok: false, message: denied }

  const skill = STAGE_SKILLS.find((item) => item.id === input.action)
  if (!skill) {
    const names = STAGE_SKILLS.map((item) => `${item.id}（${item.label}）`).join("、")
    return { ok: false, message: `不认识这个动作。作品编辑可以用：${names}。` }
  }

  const draft = input.draft?.trim() ?? ""
  if (!draft) {
    return { ok: false, message: "还没有成稿。请把要改的正文贴进来，再选润色、违禁词审查、公众号排版或发布前质检。空着不算完成。" }
  }
  if (draft.length > MAX_RAW_INPUT_CHARS) {
    return { ok: false, message: "成稿太长，超过了这一次能处理的字数。" }
  }

  const projectId = resolveWorkEditorProjectId(context)
  if (!projectId) {
    return { ok: false, message: "还没有绑定项目，作品编辑开不了工。请先在账号里绑好 IP 营销全案。没有项目不算成功。" }
  }

  const idempotencyKey = input.idempotencyKey?.trim() || workEditorIdempotencyKey(projectId, input.action, draft)
  if (idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return { ok: false, message: "幂等键长度不对。可以不传，系统会按项目、动作和成稿自动生成。" }
  }

  return {
    ok: true,
    label: skill.label,
    submission: {
      idempotencyKey,
      projectId,
      agentId: skill.agentId as AimAgentId,
      rawInput: draft,
      targetFormats: targetFormatsFor(skill.id),
      instruction: `${skill.prompt}\n${DRAFT_BOUNDARY}`,
      topicTitle: input.topicTitle,
    },
  }
}

export async function startWorkEditorJob(
  context: AgentApiContext,
  input: WorkEditorStartInput,
): Promise<
  | { ok: true; label: string; created: boolean; response: AgentInvocationResponse }
  | { ok: false; errorCode: string; errorMessage: string }
> {
  const built = buildWorkEditorSubmission(context, input)
  if (!built.ok) return { ok: false, errorCode: "WORK_EDITOR_BLOCKED", errorMessage: built.message }
  const submitted = await submitInvocation(context, built.submission)
  if (!submitted.ok) return submitted
  return { ok: true, label: built.label, created: submitted.created, response: submitted.response }
}
