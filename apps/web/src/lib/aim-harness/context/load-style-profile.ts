/**
 * generate 路径写作风格档案加载（与 chat retrieveChatContextBlocks 对齐）。
 *
 * 门控：generationIntent.useStyleProfile。
 * contextOverride 存在时不打 live DB，仅消费可选冻结块，保证 eval / 单测零库依赖。
 */

import { getStyleProfileBlock } from "@/lib/style-profile"
import {
  runAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import type { AimGenerationContextOverride } from "@/lib/aim/agent-types"

export async function loadStyleProfileForGenerate(input: {
  userId: string
  projectId?: string
  useStyleProfile: boolean
  contextOverride?: AimGenerationContextOverride
  trace?: AimTraceRecorder
}): Promise<string> {
  const { userId, projectId, useStyleProfile, contextOverride, trace } = input

  if (contextOverride) {
    const frozen = contextOverride.styleProfileBlock ?? ""
    return frozen.trim() ? frozen : ""
  }

  if (!useStyleProfile) return ""

  return runAimTraceStep(
    trace,
    "style_profile",
    "风格档案召回",
    () => getStyleProfileBlock(userId, projectId ?? null).catch(() => ""),
    (block) => ({
      summary: block ? "已召回" : "无风格档案",
      metadata: { chars: block.length },
    }),
  )
}

/** 把风格块并入知识上下文（chat 侧 composeAimReferenceContext 的 generate 等价物） */
export function mergeStyleIntoKnowledgeBlock(
  knowledgeBlock: string,
  styleBlock: string,
): string {
  const style = styleBlock.trim()
  if (!style) return knowledgeBlock
  const knowledge = knowledgeBlock.trim()
  return knowledge ? `${knowledge}\n${style}` : style
}
