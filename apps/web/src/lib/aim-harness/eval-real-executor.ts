import { buildAimChatResponse, buildAimGeneration } from "@/lib/aim-agent-handlers"
import { resolveAimConversationIntentWithRules } from "@/lib/aim-conversation-intent"

import { runAimChat, runAimGenerate } from "./adapters"
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

function warnedInsufficientInfo(drafts: Array<{ content: string }>): boolean {
  return drafts.some((draft) => /信息不足|未提供|待补充|缺少/.test(draft.content))
}

const runRealGeneration: RealCaseRunner = async (fixture, context) => {
  const rawInput = composeRawInput(fixture, context)
  const targetFormats = fixture.input.targetFormats ?? fixture.expectations.outputFormats
  const contextManifest = buildContextManifest(fixture, context)
  const harness = await runAimGenerate({
    execute: () => buildAimGeneration(fixture.agent, {
      userId: "aim-eval",
      rawInput,
      targetFormats,
      taskType: fixture.input.taskType,
      topicTitle: fixture.input.topicTitle,
      topicRationale: fixture.input.topicRationale,
      topicType: fixture.input.topicType,
      hotTopic: fixture.input.hotTopic,
      polishInstruction: fixture.input.polishInstruction,
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
    }),
    rawInput,
    agentId: fixture.agent,
    targetFormats,
    taskType: fixture.input.taskType,
    polishInstruction: fixture.input.polishInstruction,
    topicType: fixture.input.topicType,
    hotTopic: fixture.input.hotTopic,
    entrypoint: fixture.entrypoint === "agent_api" ? "agent_api" : fixture.entrypoint === "inspiration" ? "inspiration" : "generate",
    contextManifest,
    runLlmQuality: false,
    persistSnapshot: false,
  })
  const drafts = harness.result.results.map((item) => ({ format: item.format, content: item.content }))
  return {
    drafts,
    citedKnowledgeIds: harness.result.knowledgeUsed.map((entry) => entry.id),
    warnedInsufficientInfo: warnedInsufficientInfo(drafts),
    runId: harness.runId,
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
  const harness = await runAimChat({
    execute: () => buildAimChatResponse(fixture.agent, {
      userId: "aim-eval",
      messages,
      knowledgeBlock: context.knowledgeBlock,
      conversationIntent,
      runtimeTask: fixture.expectations.runtimeTask,
    }).then((response) => response.content),
    rawInput,
    agentId: fixture.agent,
    messages,
    contextManifest,
    persistSnapshot: false,
  })
  const drafts = [{ format: "raw_copy", content: harness.content }]
  return {
    drafts,
    citedKnowledgeIds: context.knowledgeIds,
    warnedInsufficientInfo: warnedInsufficientInfo(drafts),
    runId: harness.runId,
  }
}

export function createRealEvalExecutor(dependencies: RealEvalDependencies = {}): EvalExecutor {
  const generate = dependencies.generate ?? runRealGeneration
  const chat = dependencies.chat ?? runRealChat
  return (fixture, context) => fixture.entrypoint === "chat"
    ? chat(fixture, context)
    : generate(fixture, context)
}
