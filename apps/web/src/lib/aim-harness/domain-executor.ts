import {
  buildAimChatResponse,
  buildAimChatResponseStream,
} from "@/lib/aim-agent-handlers"
import { generateAimContent } from "@/lib/aim-generator"

import type { AimContextSource, AimRunSpec } from "./types"

type GenerationInput = Parameters<typeof generateAimContent>[0]
type ChatInput = Parameters<typeof buildAimChatResponse>[1]

/** 运行时到领域执行的唯一生成端口，Route 不再直接调用 generator。 */
/**
 * @description 执行aimgenerationdomain
 * @param spec - 规格
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function executeAimGenerationDomain(
  spec: AimRunSpec,
  input: Omit<GenerationInput, "agentId" | "runtimeTask" | "runSpec">,
) {
  const output = await generateAimContent({
    ...input,
    agentId: spec.agentId,
    runtimeTask: spec.runtimeTask,
    runSpec: spec,
  })
  return { output, generationId: output.id }
}

/** 运行时到领域执行的唯一非流式聊天端口。 */
/**
 * @description 执行aimchatdomain
 * @param spec - 规格
 * @param input - 输入数据
 * @param contextManifest? - 上下文Manifest?
 * @returns 无返回值
 */
export async function executeAimChatDomain(
  spec: AimRunSpec,
  input: ChatInput,
  contextManifest?: AimContextSource[],
) {
  const response = await buildAimChatResponse(spec.agentId, {
    ...input,
    runtimeTask: spec.runtimeTask,
    modelPolicy: spec.modelPolicy,
  })
  return { output: response.content, contextManifest }
}

/** 运行时到领域执行的唯一流式聊天端口。 */
/**
 * @description streamaimchatdomain
 * @param spec - 规格
 * @param input - 输入数据
 * @returns 无返回值
 */
export function streamAimChatDomain(spec: AimRunSpec, input: ChatInput) {
  return buildAimChatResponseStream(spec.agentId, {
    ...input,
    runtimeTask: spec.runtimeTask,
    modelPolicy: spec.modelPolicy,
  })
}
