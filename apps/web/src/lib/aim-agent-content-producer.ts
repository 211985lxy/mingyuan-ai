import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildScenarioPromptBlock } from "@/lib/content-scenario-config"
import { FORMAT_INSTRUCTIONS, buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  buildWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
  isGenericContentRequestWithoutFacts,
} from "@/lib/aim-generation-prompts"
import { AIM_NORTH_STAR_GOAL } from "@/lib/aim-intent-boundaries"
import {
  buildClosedWorldModelInput,
  hasStrictNumericClaimConstraint,
} from "@/lib/aim-generation-guardrails"
import { isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"
import { buildContentPackageConstraintBlock } from "@/lib/content-package-spec"
import { getCanonicalFromTaskSpec, isCanonicalConfirmed } from "@/lib/canonical-content-spec"
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
        results: context.targetFormats.map((format) => ({
          format,
          content: traced[format],
          wordCount: traced[format].length,
        })),
        knowledgeUsed: record.knowledgeUsed as any[],
        taskSpec: (record as {
          taskSpec?: import("@/lib/task-spec").TaskSpec
        }).taskSpec,
        workflowStatus: "draft",
        projectId: context.projectId ?? null,
      }
    }
    const agentPrompt = `你是企业营销内容专家（内容创作官）。${AIM_NORTH_STAR_GOAL}根据用户提供的信息与客户档案，生成高质量、可拍摄可发布的营销内容。`
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
    const systemPrompt = closedWorldFastRun
      ? `${agentPrompt}\n这是闭集事实任务：只使用用户原始输入里的事实、客户信息和数字，不调用或复述其他背景事实。客户案例段只能逐字引用用户原文里的事实锚点；禁止补充人员、流程、渠道、做法、原因、其他结果或因果解释，禁止计算、换算或概括降幅、比例等衍生数字，禁止用“他们”“该公司”“这家公司”引出任何新信息。结尾只执行用户指定的行动引导，不增加免费、保证、限时或交付承诺。直接输出完整成稿，不解释、不分析、不增加案例细节。`
      : buildProducerSystemPrompt(agentPrompt, context)
        + scenarioBlock
        + (canonicalBlock ? `\n\n${canonicalBlock}` : "")
        + (packageConstraints ? `\n\n${packageConstraints}` : "")
    const userPrompt = closedWorldFastRun
      ? `用户批准的全部事实与要求：\n${buildClosedWorldModelInput(context.rawInput)}\n\n写成自然、完整、可直接拍摄的口播正文。\n输出格式：\n${context.targetFormats.map((format) => `===FORMAT:${format}===`).join("\n")}`
      : buildUserPrompt(context, formatBlocks)
    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      context.targetFormats,
    )
    const traced = Object.fromEntries(
      context.targetFormats.map((format) => [
        format,
        ensureContentCreationTrace(parsed[format] || "", context),
      ]),
    ) as Record<(typeof context.targetFormats)[number], string>
    const record = await saveAimGenerationRecord(context, completion, traced)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => ({
        format,
        content: traced[format],
        wordCount: traced[format].length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
      workflowStatus: (record as { workflowStatus?: string }).workflowStatus || "draft",
      projectId: (record as { projectId?: string | null }).projectId ?? context.projectId ?? null,
    }
  }
}
