import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import {
  addAimTraceStep,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { resolveAndComposeMethodologyBlock } from "@/lib/methodology/compose-matched-methodology-block"
import type { TaskSpec } from "@/lib/task-spec"
import type { AimAgentId } from "../contracts"
import type { AimRunSpec } from "../types"
import type { PrepareAimContextInput } from "../context-assembly"

/**
 * IP 方法论动态选卡：intent → plan → 只注入匹配卡片（eval override 保留冻结块）。
 * 从 prepareAimContext step 3.6 逐字迁出。
 */
export async function resolveMethodologyInjectionForGenerate(input: {
  agentId: AimAgentId
  spec: AimRunSpec
  params: PrepareAimContextInput
  taskSpec: TaskSpec | undefined
  runtimeTask: AimRuntimeTask
  generationIntent: { useMethodology: boolean }
  methodologyBlock: string
  skillBlock: string
  trace?: AimTraceRecorder
}) {
  const {
    agentId, spec, params, taskSpec, runtimeTask,
    generationIntent, methodologyBlock, skillBlock, trace,
  } = input

  const useFrozenMethodology = Boolean(params.contextOverride?.methodologyBlock)
  const methodologyEnabled = generationIntent.useMethodology || useFrozenMethodology
  const { plan: methodologyPlan, block: methodologyWithSkills } = !methodologyEnabled
    ? {
        plan: resolveAndComposeMethodologyBlock({
          agentId,
          rawInput: spec.rawInput,
          taskSpec,
          runtimeTask,
          topicType: params.topicType,
          mode: "generate" as const,
          fallbackBlock: "",
        }).plan,
        block: skillBlock,
      }
    : useFrozenMethodology
      ? {
          plan: resolveAndComposeMethodologyBlock({
            agentId,
            rawInput: spec.rawInput,
            taskSpec,
            runtimeTask,
            topicType: params.topicType,
            mode: "generate" as const,
            skillBlock,
            fallbackBlock: methodologyBlock,
          }).plan,
          block: [methodologyBlock, skillBlock].filter(Boolean).join("\n\n"),
        }
      : resolveAndComposeMethodologyBlock({
          agentId,
          rawInput: spec.rawInput,
          taskSpec,
          runtimeTask,
          topicType: params.topicType,
          mode: "generate",
          skillBlock,
          fallbackBlock: methodologyBlock,
        })

  const taskSpecWithPlan = taskSpec
    ? { ...taskSpec, methodologyPlan }
    : taskSpec

  await addAimTraceStep(trace, {
    key: "methodology_plan",
    label: "方法论选卡",
    status: "success",
    summary: `goal=${methodologyPlan.businessGoal} route=${methodologyPlan.contentRoute}`,
    metadata: {
      cardIds: methodologyPlan.cardIds,
      source: methodologyPlan.source,
      confidence: methodologyPlan.confidence,
      structureModules: methodologyPlan.structureModules,
      dynamicCards: !useFrozenMethodology,
    },
  })

  return { methodologyPlan, methodologyWithSkills, taskSpecWithPlan }
}
