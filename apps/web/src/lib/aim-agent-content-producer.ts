import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildScenarioPromptBlock } from "@/lib/content-scenario-config"
import { FORMAT_INSTRUCTIONS, buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  buildWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-prompts"
import { AIM_NORTH_STAR_GOAL } from "@/lib/aim-intent-boundaries"
import { AIM_ASSISTANT_PERSONA } from "@/lib/aim/assistant-persona"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"
import {
  buildClosedWorldModelInput,
  hasStrictNumericClaimConstraint,
} from "@/lib/aim-generation-guardrails"
import { isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"
import { buildContentPackageConstraintBlock } from "@/lib/content-package-spec"
import { getCanonicalFromTaskSpec, isCanonicalConfirmed } from "@/lib/canonical-content-spec"
import { buildUnifiedProducerSystemPrompt, buildUnifiedProducerUserPrompt } from "@/lib/aim/unified-content-prompts"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"

export class ContentProducerHandler implements AimAgentHandler {
  agentId = "content_producer" as const

  private buildChatPrompt(params: AimChatParams): string {
    const latestUser = [...(params.messages ?? [])]
      .reverse()
      .find((m) => m?.role === "user" && typeof m?.content === "string")?.content || ""
    const workflowContext = buildWorkflowContext({
      taskSpec: params.taskSpec,
      rawInput: latestUser,
      runtimeTask: params.runtimeTask,
    })
    return buildContentProducerChatPrompt({
      conversationBlock: params.conversationBlock,
      knowledgeBlock: params.knowledgeBlock,
      methodologyBlock: params.methodologyBlock,
      ipWikiBlock: params.ipWikiBlock,
      selectedMethodologyBlock: params.selectedMethodologyBlock,
      workflowContext,
      runtimeTask: params.runtimeTask,
      knowledgeStrategy: params.knowledgeStrategy,
      methodologyPlan: params.methodologyPlan ?? params.taskSpec?.methodologyPlan,
      rawInput: latestUser,
      hasBenchmarkText: /对标原文|对标文案/.test(latestUser),
    })
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    if (isGenericContentRequestWithoutFacts(context)) {
      const warning =
        "信息不足：请补充这条内容的主题、目标受众，以及产品/观点/真实案例中的至少一项；在资料补齐前我不会编造脚本。"
      const completion = {
        content: warning,
        model: "aim-deterministic-safety-gate",
        provider: "aim",
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }
      const traced = Object.fromEntries(
        context.targetFormats.map((format) => [
          format,
          ensureContentCreationTrace(warning, context),
        ]),
      ) as Record<(typeof context.targetFormats)[number], string>
      const record = await saveAimGenerationRecord(context, completion, traced)
      return {
        id: record.id,
        results: context.targetFormats.map((format) => {
          const { content, reasoningSummary } = splitGenerationReasoning(traced[format])
          return { format, content, reasoningSummary, wordCount: content.length }
        }),
        knowledgeUsed: record.knowledgeUsed as any[],
        taskSpec: (record as {
          taskSpec?: import("@/lib/task-spec").TaskSpec
        }).taskSpec,
        workflowStatus: "draft",
        projectId: context.projectId ?? null,
      }
    }
    const agentPrompt = `${AIM_ASSISTANT_PERSONA}${AIM_NORTH_STAR_GOAL}根据用户提供的信息与客户档案，生成高质量、可拍摄可发布的营销内容。`
    const formatBlocks = context.targetFormats
      .map((format) => FORMAT_INSTRUCTIONS[format])
      .join("\n\n---\n\n")
    const packageConstraints = buildContentPackageConstraintBlock(context.targetFormats)
    const canonical = getCanonicalFromTaskSpec(context.taskSpec)
    const canonicalBlock =
      canonical && isCanonicalConfirmed(canonical)
        ? [
            "【已确认母内容——派生时不得改事实】",
            `核心观点：${canonical.coreMessage}`,
            `目标客户：${canonical.targetCustomer}`,
            `真实问题：${canonical.realProblem}`,
            `内容目标：${canonical.contentGoal}`,
            `期望行动：${canonical.desiredAction}`,
            canonical.mustKeep.length ? `必须保留：${canonical.mustKeep.join("；")}` : "",
            canonical.avoid.length ? `禁区：${canonical.avoid.join("；")}` : "",
            canonical.evidence.length
              ? `证据：${canonical.evidence.map((item) => item.statement).slice(0, 8).join("；")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : ""
    const scenarioBlock = buildScenarioPromptBlock(context.contentScenario)
    const closedWorldFastRun = isAimFastSpokenRoute(context.modelPolicy?.routeKey)
      && hasStrictNumericClaimConstraint(context.rawInput)
    const systemPrompt = context.unifiedContentExecution
      ? buildUnifiedProducerSystemPrompt(context)
      : closedWorldFastRun
      ? `${agentPrompt}\n${promptRegistry.get(PROMPT_KEYS.contentProducerClosedSetFacts).content}`
      : buildProducerSystemPrompt(agentPrompt, context)
        + scenarioBlock
        + (canonicalBlock ? `\n\n${canonicalBlock}` : "")
        + (packageConstraints ? `\n\n${packageConstraints}` : "")
    const userPrompt = context.unifiedContentExecution
      ? buildUnifiedProducerUserPrompt(context, formatBlocks)
      : closedWorldFastRun
      ? `用户批准的全部事实与要求：\n${buildClosedWorldModelInput(context.rawInput)}\n\n写成自然、完整、可直接拍摄且符合指定时长的口播正文。事实标记前依次写清目标客户、用户明确给出的痛点、问题为什么会持续，以及不新增事实和数字的可执行判断；事实标记只能出现一次；标记后只保留用户指定的唯一行动引导。\n输出格式：\n${context.targetFormats.map((format) => `===FORMAT:${format}===`).join("\n")}`
      : buildUserPrompt(context, formatBlocks)
    const { completion, parsed, safetyWarning } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      context.targetFormats,
    )
    const traced = Object.fromEntries(
      context.targetFormats.map((format) => [
        format,
        ensureContentCreationTrace(parsed[format] || "", context, safetyWarning),
      ]),
    ) as Record<(typeof context.targetFormats)[number], string>
    const record = await saveAimGenerationRecord(context, completion, traced)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => {
        const { content, reasoningSummary } = splitGenerationReasoning(traced[format])
        return { format, content, reasoningSummary, wordCount: content.length }
      }),
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
      workflowStatus: (record as { workflowStatus?: string }).workflowStatus || "draft",
      projectId: (record as { projectId?: string | null }).projectId ?? context.projectId ?? null,
    }
  }
}
