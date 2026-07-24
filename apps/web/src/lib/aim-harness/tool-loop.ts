/**
 * BoundedToolLoop — 有界「先查再写」（14 周正本阶段 3）。
 *
 * 模型最多走 maxSteps 轮：每轮可调用 L0 感知工具，观察结果追加到上下文；
 * 达到步数/超时/主动结束则返回汇总笔记，供 prepareAimContext 并入知识块。
 * 禁止外发副作用工具进入本环。
 */

import { getAgentLLM } from "@/lib/llm/agent-router"
import type { ChatMessage } from "@/lib/llm/types"
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import {
  BOUND_TOOL_LOOP_TOOL_NAMES,
  executeBoundToolLoopTool,
  type BoundToolLoopToolName,
  type BoundToolLoopToolContext,
} from "./tool-loop-tools"

export const DEFAULT_TOOL_LOOP_MAX_STEPS = 6
export const DEFAULT_TOOL_LOOP_TIMEOUT_MS = 60_000

export interface BoundToolLoopInput {
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  rawInput: string
  userId: string
  projectId?: string
  maxSteps?: number
  timeoutMs?: number
  /** 可注入 complete，便于单测 */
  complete?: (messages: ChatMessage[]) => Promise<string>
}

export interface BoundToolLoopStep {
  step: number
  thought?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  observation?: string
  error?: string
}

export interface BoundToolLoopResult {
  notes: string
  steps: BoundToolLoopStep[]
  stopReason:
    | "completed"
    | "max_steps"
    | "timeout"
    | "human_required"
    | "parse_error"
    | "tool_unauthorized"
    | "tool_failed"
  toolFailureCount: number
}

const SYSTEM = `你是 AIM 的有界检索助手。在写正文之前，先判断是否需要查阅项目知识或记忆。
你可以调用工具，也可以直接结束。

每轮只输出一个 JSON 对象，不要 markdown：
{"action":"tool","tool":"search_project_knowledge"|"get_project_memories"|"read_aim_generation"|"read_work_item"|"request_human_review","args":{...},"reason":"..."}
或
{"action":"finish","notes":"给后续写作者的要点（可空）","reason":"..."}

规则：
- 资料已足够时立刻 finish。
- 信息明显不足且无法靠检索补齐时，调用 request_human_review。
- 只读当前项目；不要编造客户事实；notes 只写检索到的要点。`

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      const parsed = JSON.parse(match[0])
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
}

function isToolName(value: unknown): value is BoundToolLoopToolName {
  return typeof value === "string" && (BOUND_TOOL_LOOP_TOOL_NAMES as readonly string[]).includes(value)
}

function summarizeNotes(steps: BoundToolLoopStep[]): string {
  const lines = steps
    .filter((step) => step.observation)
    .map((step) => `【${step.toolName}】${step.observation}`)
  return lines.join("\n\n").slice(0, 4000)
}

/**
 * @description 运行有界工具环，返回可并入上下文的 notes
 */
export async function runBoundedToolLoop(input: BoundToolLoopInput): Promise<BoundToolLoopResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_TOOL_LOOP_MAX_STEPS
  const timeoutMs = input.timeoutMs ?? DEFAULT_TOOL_LOOP_TIMEOUT_MS
  const started = Date.now()
  const steps: BoundToolLoopStep[] = []
  let toolFailureCount = 0
  const toolCtx: BoundToolLoopToolContext = {
    userId: input.userId,
    projectId: input.projectId,
    rawInput: input.rawInput,
    allowedToolNames: BOUND_TOOL_LOOP_TOOL_NAMES,
  }

  const complete =
    input.complete ??
    (async (messages: ChatMessage[]) => {
      const result = await getAgentLLM(input.agentId).complete({
        messages,
        temperature: 0,
        maxTokens: 800,
      })
      return result.content
    })

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `agent=${input.agentId}`,
        `runtimeTask=${input.runtimeTask}`,
        `projectId=${input.projectId ?? "无"}`,
        "可用工具：search_project_knowledge / get_project_memories / read_aim_generation / read_work_item / request_human_review",
        "",
        "用户任务：",
        input.rawInput.slice(0, 4000),
      ].join("\n"),
    },
  ]

  for (let step = 1; step <= maxSteps; step += 1) {
    if (Date.now() - started > timeoutMs) {
      return { notes: summarizeNotes(steps), steps, stopReason: "timeout", toolFailureCount }
    }

    let raw: string
    try {
      raw = await complete(messages)
    } catch (error) {
      toolFailureCount += 1
      steps.push({
        step,
        error: error instanceof Error ? error.message : String(error),
      })
      return { notes: summarizeNotes(steps), steps, stopReason: "parse_error", toolFailureCount }
    }

    const parsed = parseJsonObject(raw)
    if (!parsed) {
      steps.push({ step, thought: raw.slice(0, 200), error: "invalid_json" })
      return { notes: summarizeNotes(steps), steps, stopReason: "parse_error", toolFailureCount }
    }

    const action = parsed.action
    if (action === "finish") {
      const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : ""
      steps.push({ step, thought: typeof parsed.reason === "string" ? parsed.reason : undefined })
      return {
        notes: [notes, summarizeNotes(steps)].filter(Boolean).join("\n\n").trim(),
        steps,
        stopReason: "completed",
        toolFailureCount,
      }
    }

    if (action !== "tool" || !isToolName(parsed.tool)) {
      steps.push({ step, error: "invalid_action" })
      return { notes: summarizeNotes(steps), steps, stopReason: "parse_error", toolFailureCount }
    }

    const args =
      parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
        ? (parsed.args as Record<string, unknown>)
        : {}

    let observation: string
    try {
      observation = await executeBoundToolLoopTool(parsed.tool, args, toolCtx)
    } catch (error) {
      toolFailureCount += 1
      const message = error instanceof Error ? error.message : String(error)
      steps.push({ step, toolName: parsed.tool, toolArgs: args, error: message })
      const unauthorized = /未注册|禁止进入 Tool Loop|未被当前 RunSpec/.test(message)
      return {
        notes: summarizeNotes(steps),
        steps,
        stopReason: unauthorized ? "tool_unauthorized" : "tool_failed",
        toolFailureCount,
      }
    }

    steps.push({
      step,
      thought: typeof parsed.reason === "string" ? parsed.reason : undefined,
      toolName: parsed.tool,
      toolArgs: args,
      observation: observation.slice(0, 2000),
    })

    if (parsed.tool === "request_human_review") {
      return { notes: summarizeNotes(steps), steps, stopReason: "human_required", toolFailureCount }
    }

    messages.push({ role: "assistant", content: raw })
    messages.push({
      role: "user",
      content: `工具 ${parsed.tool} 返回：\n${observation.slice(0, 3000)}\n\n请继续（tool 或 finish）。`,
    })
  }

  return { notes: summarizeNotes(steps), steps, stopReason: "max_steps", toolFailureCount }
}
