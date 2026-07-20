/**
 * Tool action branch for AIM chat (e.g. Lark actions).
 *
 * Validates project ownership, delegates to the action handler, and wraps
 * with trace. Extracted from chat-context.ts (WP-3).
 */
import { handleLarkToolAction } from "@/lib/aim-tool-actions"
import {
  addAimTraceStep,
  failAimTrace,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { NextResponse } from "next/server"

/**
 * Handle the tool-action branch: validate project ownership, delegate to
 * handleLarkToolAction, and return the JSON response with trace.
 */
/**
 * @description 处理toolactionbranch
 * @param input - 输入数据
 * @returns Promise<NextResponse>
 */
export async function handleToolActionBranch(input: {
  trace?: AimTraceRecorder
  toolAction: string
  userId: string
  projectId: string
  resultId: string
}): Promise<NextResponse> {
  const { trace, toolAction, userId, projectId, resultId } = input
  if (!projectId) {
    return NextResponse.json({ error: "请先选择 IP 营销全案" }, { status: 400 })
  }
  const result = await runAimTraceStep(
    trace,
    "tool_action",
    "工具动作执行",
    () => handleLarkToolAction(toolAction, { userId, projectId, resultId }),
    (res) => ({ outputSummary: summarizeText(res) }),
  )
  await finishAimTrace(trace, { outputSummary: summarizeText(result) })
  return NextResponse.json(result)
}
