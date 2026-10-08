/**
 * 用钥匙上的用户身份，走网页同一套生成。
 * 空正文、没项目、跑完没字，都算失败。
 */

import { buildAimNextActionPrompt } from "@/lib/aim-agent-guides"
import { buildAimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import { usesUnifiedAimExecuteEntry } from "@/lib/aim/unified-execute-entry"
import { resolveSkillInputText } from "@/features/aim/aim-skill-utils"
import { AccountProjectContextError } from "@/lib/account-project-context"
import { failAimTrace } from "@/lib/aim-observability"
import { mapAimErrorToUserMessage, toAimFailureResponse } from "@/lib/aim-error-message"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { AIM_EXECUTION_DEADLINE_MS, runWithAimExecutionDeadline } from "@/lib/llm/execution-deadline"
import { runSignedInAimGenerate, type SignedInGenerateState } from "@/lib/aim/services/signed-in-generate"
import {
  runSignedInAimExecute,
  settleSignedInExecuteFailure,
  type SignedInExecuteState,
} from "@/lib/aim/services/signed-in-execute"
import { getAimAgent } from "@/lib/aim-ui-config"
import type { AimExecuteBody } from "@/features/aim/contracts/api"
import type { AimPageAction } from "./page-action-catalog"

const RESULT_KEYS = ["rawCopy", "videoScript", "wechatArticle", "momentsPost", "communityMessage", "shootingBrief"] as const

export async function runAimPageJob(
  userId: string,
  action: AimPageAction,
  material: string,
  topicTitle?: string,
): Promise<{ ok: true; text: string } | { ok: false; code: string; message: string }> {
  const quota = await enforceDailyBetaLimit(userId, "aim_generate")
  if (quota) return quotaFailure(quota)
  const request = buildPageRequest(action, material, topicTitle)
  const generateState: SignedInGenerateState = {}
  const executeState: SignedInExecuteState = {}
  try {
    const result = usesUnifiedAimExecuteEntry(action.agentId)
      ? await runSignedInAimExecute({ userId, parsed: request.execute, state: executeState })
      : await runWithAimExecutionDeadline(
        AIM_EXECUTION_DEADLINE_MS,
        () => runSignedInAimGenerate({ userId, body: request.generate, state: generateState }),
      )
    return interpretPageResult(result)
  } catch (error) {
    await settlePageFailure(usesUnifiedAimExecuteEntry(action.agentId), executeState, generateState, error)
    return pageFailure(error)
  }
}

export function emptyMaterialMessage(action: Pick<AimPageAction, "materialNoun">) {
  if (action.materialNoun === "成稿") {
    return "还没有成稿。请把要改的正文贴进来。空着不算完成。"
  }
  return "还没有素材。页面也不会空着开始。请把业务情况、选题或要写的内容贴进来。"
}

function buildPageRequest(action: AimPageAction, material: string, topicTitle?: string) {
  const agentId = action.agentId || "content_producer"
  const currentUserRequest = userRequestFor(action, material)
  const sourceEnvelope = buildAimContentSourceEnvelope({
    currentUserRequest,
    relevantConversation: [],
    referenceMaterials: [],
  })
  const targetFormats = getAimAgent(agentId).defaultFormats
  const execute = {
    agentId,
    sourceEnvelope,
    targetFormats,
  } as AimExecuteBody
  return {
    execute,
    generate: {
      agentId,
      rawInput: sourceEnvelope.currentUserRequest,
      sourceEnvelope,
      targetFormats,
      taskType: "write_script",
      ...(agentId === "business_diagnosis" ? { useMarketViralVideos: true } : {}),
      ...(topicTitle ? { topicTitle } : {}),
    },
  }
}

function userRequestFor(action: AimPageAction, material: string) {
  if (action.skill) {
    return resolveSkillInputText({ skill: action.skill, prompt: action.skill.prompt, currentInput: material })
  }
  if (action.prompt) {
    return buildAimNextActionPrompt({ id: action.toolName, label: action.title, prompt: action.prompt }, material)
  }
  return material.trim()
}

function interpretPageResult(result: { status: number; body: Record<string, unknown> }) {
  if (result.status !== 200) {
    return {
      ok: false as const,
      code: String(result.body.code || "PAGE_FAILED"),
      message: String(result.body.error || "页面没有完成这次生成。"),
    }
  }
  const text = collectPageText(result.body)
  if (!text) {
    return { ok: false as const, code: "EMPTY_RESULT", message: "跑完了，但没有可交付正文。空结果不算成功。" }
  }
  return { ok: true as const, text: presentPageText(result.body, text) }
}

function presentPageText(body: Record<string, unknown>, text: string) {
  if (body.kind === "clarification") return `页面先要确认，还没出稿：\n${text}`
  if (body.kind === "reply") return text
  return `下面是草稿，还没发布。\n\n${text}`
}

function collectPageText(body: Record<string, unknown>) {
  if (body.kind === "clarification") return String(body.question ?? "").trim()
  if (body.kind === "reply") return String(body.content ?? "").trim()
  const fromResults = readResultContents(body.results)
  if (fromResults) return fromResults
  for (const key of RESULT_KEYS) {
    const value = body[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function readResultContents(results: unknown) {
  if (!Array.isArray(results)) return ""
  return results
    .map((item) => item && typeof item === "object" ? String((item as { content?: unknown }).content ?? "").trim() : "")
    .filter(Boolean)
    .join("\n\n")
}

async function quotaFailure(quota: Response) {
  const payload = await quota.clone().json().catch(() => ({})) as { error?: string }
  return { ok: false as const, code: "QUOTA", message: payload.error || "今天的生成次数用完了。" }
}

function pageFailure(error: unknown) {
  if (error instanceof AccountProjectContextError) {
    return { ok: false as const, code: error.code, message: error.message }
  }
  const failure = toAimFailureResponse(error, "mcp")
  return { ok: false as const, code: failure.code, message: mapAimErrorToUserMessage(error, failure.error) }
}

async function settlePageFailure(
  unified: boolean,
  executeState: SignedInExecuteState,
  generateState: SignedInGenerateState,
  error: unknown,
) {
  if (unified) {
    await settleSignedInExecuteFailure(executeState, error)
    return
  }
  if (generateState.trace) await failAimTrace(generateState.trace, error)
}
