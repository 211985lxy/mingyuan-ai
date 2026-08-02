import { buildAimChatResponse, buildAimGeneration } from "@/lib/aim-agent-handlers"
import { resolveAimConversationIntentWithRules } from "@/lib/aim-conversation-intent"

import { executeAimRun } from "./runtime"
import type { EvalContext, EvalExecutionResult, EvalExecutor } from "./eval-runner"
import type { EvalFixture } from "./eval/contracts"
import { sha256 } from "./hashing"
import type { AimContextSource } from "./types"

type RealCaseRunner = (fixture: EvalFixture, context: EvalContext) => Promise<EvalExecutionResult>

export interface RealEvalDependencies {
  generate?: RealCaseRunner
  chat?: RealCaseRunner
}

function composeRawInput(fixture: EvalFixture, context: EvalContext): string {
  return [
    fixture.input.rawInput,
    context.videoCopyBlock ? `【冻结对标上下文】\n${context.videoCopyBlock}` : "",
    context.marketViralBlock ? `【冻结市场上下文】\n${context.marketViralBlock}` : "",
  ].filter(Boolean).join("\n\n")
}

function buildContextManifest(fixture: EvalFixture, context: EvalContext): AimContextSource[] {
  const sources: AimContextSource[] = fixture.seedContext.knowledge.map((entry) => ({
    kind: "knowledge",
    id: entry.id,
    charCount: entry.content.length,
    contentHash: sha256(entry.content),
  }))
  const blocks: Array<[AimContextSource["kind"], string, string]> = [
    ["ip_wiki", "frozen_ip_wiki", context.ipWikiBlock],
    ["video_copy", "frozen_video_copy", context.videoCopyBlock],
    ["market_viral", "frozen_market_viral", context.marketViralBlock],
  ]
  for (const [kind, id, content] of blocks) {
    if (content) sources.push({ kind, id, charCount: content.length, contentHash: sha256(content) })
  }
  return sources
}

/**
 * @description warnedinsufficientinfo
 * @param drafts - drafts
 * @returns boolean
 */
export function warnedInsufficientInfo(drafts: Array<{ content: string }>): boolean {
  return drafts.some((draft) => /信息不足|未提供|尚未提供|没有提供|(?:还没(?:有)?|没有)登记|数据(?:没|未)(?:登记|提供)|复盘做不了|做不了(?:结果)?复盘|还不知道效果|待补充|缺少|缺失|不完整|并非完整|没有(?:任何)?真实数字|没有真实数据|都是空的|没法判断|无法判断|不会编数字|不能假装|必须先补数据/.test(draft.content))
}

const runRealGeneration: RealCaseRunner = async (fixture, context) => {
  const rawInput = composeRawInput(fixture, context)
  const targetFormats = fixture.input.targetFormats ?? fixture.expectations.outputFormats
  const contextManifest = buildContextManifest(fixture, context)
  const run = await executeAimRun({
    entrypoint: fixture.entrypoint === "agent_api" ? "agent_api" : fixture.entrypoint === "inspiration" ? "inspiration" : "generate",
    rawInput,
    agentId: fixture.agent,
    targetFormats,
    taskType: fixture.input.taskType,
    polishInstruction: fixture.input.polishInstruction,
    topicTitle: fixture.input.topicTitle,
    topicRationale: fixture.input.topicRationale,
    topicType: fixture.input.topicType,
    hotTopic: fixture.input.hotTopic,
    actorId: "aim-eval",
    contextManifest,
    runLlmQuality: false,
    persistSnapshot: false,
    stableRouting: false,
  }, async (spec) => {
    const output = await buildAimGeneration(spec.agentId, {
      userId: "aim-eval",
      rawInput,
      targetFormats,
      taskType: fixture.input.taskType,
      topicTitle: fixture.input.topicTitle,
      topicRationale: fixture.input.topicRationale,
      topicType: fixture.input.topicType,
      hotTopic: fixture.input.hotTopic,
      polishInstruction: fixture.input.polishInstruction,
      runtimeTask: spec.runtimeTask,
      runSpec: spec,
      skipPersistence: true,
      contextOverride: {
        knowledgeBlock: context.knowledgeBlock,
        entries: fixture.seedContext.knowledge.map((entry) => ({
          ...entry,
          tags: [],
          valueGrade: entry.valueGrade ?? null,
          score: 1,
        })),
        source: "raw",
        viralStructureBlock: context.videoCopyBlock,
        ipWikiBlock: context.ipWikiBlock,
      },
    })
    return { output, contextManifest }
  })
  const drafts = run.output.results.map((item) => ({ format: item.format, content: item.content }))
  return {
    drafts,
    citedKnowledgeIds: run.output.knowledgeUsed.map((entry) => entry.id),
    warnedInsufficientInfo: warnedInsufficientInfo(drafts),
    runId: run.metadata.runId,
  }
}

const runRealChat: RealCaseRunner = async (fixture, context) => {
  const rawInput = composeRawInput(fixture, context)
  const messages = fixture.input.messages ?? fixture.seedContext.history ?? [{ role: "user" as const, content: rawInput }]
  const conversationIntent = resolveAimConversationIntentWithRules({
    agentId: fixture.agent,
    messages,
  }).intent
  const contextManifest = buildContextManifest(fixture, context)
  const run = await executeAimRun({
    entrypoint: "chat",
    rawInput,
    agentId: fixture.agent,
    targetFormats: [],
    messages,
    actorId: "aim-eval",
    runtimeTask: fixture.expectations.runtimeTask,
    conversationMode: conversationIntent.mode,
    contextManifest,
    persistSnapshot: false,
    stableRouting: false,
  }, async (spec) => {
    const response = await buildAimChatResponse(spec.agentId, {
      userId: "aim-eval",
      messages,
      knowledgeBlock: context.knowledgeBlock,
      conversationIntent,
      runtimeTask: spec.runtimeTask,
      modelPolicy: spec.modelPolicy,
    })
    return { output: response.content, contextManifest }
  })
  const drafts = [{ format: "raw_copy", content: run.output }]
  return {
    drafts,
    citedKnowledgeIds: context.knowledgeIds,
    warnedInsufficientInfo: warnedInsufficientInfo(drafts),
    runId: run.metadata.runId,
  }
}

/**
 * @description 创建realevalexecutor
 * @param dependencies - dependencies
 * @returns EvalExecutor
 */
export function createRealEvalExecutor(dependencies: RealEvalDependencies = {}): EvalExecutor {
  const generate = dependencies.generate ?? runRealGeneration
  const chat = dependencies.chat ?? runRealChat
  return (fixture, context) => fixture.entrypoint === "chat"
    ? chat(fixture, context)
    : generate(fixture, context)
}
