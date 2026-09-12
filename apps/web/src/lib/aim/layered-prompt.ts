import {
  AIM_INTERNAL_INTENT_GATE,
  AIM_NORTH_STAR_GOAL,
  LIGHT_EDIT_OUTPUT_BOUNDARY,
  RUNTIME_TASK_LABELS,
} from "@/lib/aim-intent-boundaries"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

export interface LayeredAimPromptInput {
  roleBlock: string
  runtimeTask?: string
  taskConstraintExtra?: string
  contextBlocks: string[]
  formatBlock?: string
  qualityRedlines: string[]
}

/**
 * 统一分层 Prompt：系统角色 → 任务约束 → 上下文素材 → 输出格式 → 质量红线。
 */
export function composeLayeredAimPrompt(input: LayeredAimPromptInput): string {
  const taskLabel = input.runtimeTask
    ? (RUNTIME_TASK_LABELS[input.runtimeTask] || input.runtimeTask)
    : "未标注"
  const taskConstraintInner = [
    input.runtimeTask === "light_edit" ? LIGHT_EDIT_OUTPUT_BOUNDARY : null,
    AIM_INTERNAL_INTENT_GATE,
    input.taskConstraintExtra || null,
  ].filter(Boolean).join("\n")
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.generationLayeredSystem).content,
    {
      northStarGoal: AIM_NORTH_STAR_GOAL,
      roleBlock: input.roleBlock,
      taskLabel,
      taskConstraintInner,
      contextBlocks: input.contextBlocks.filter(Boolean).join("\n\n") || "（无额外上下文）",
      formatSection: input.formatBlock ? `【输出格式】\n${input.formatBlock}\n\n` : "",
      qualityRedlines: input.qualityRedlines.filter(Boolean).join("\n"),
    },
  )
}
