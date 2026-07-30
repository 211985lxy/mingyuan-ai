import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
} from "@/lib/aim-agent-prompts"
import {
  buildWorkflowContext,
  ensureContentCreationTrace,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
import { AIM_NORTH_STAR_GOAL, AIM_SESSION_PRIORITY_RULES, LIGHT_EDIT_OUTPUT_BOUNDARY } from "@/lib/aim-intent-boundaries"
import type { ContentFormat } from "./aim-generator"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"

function buildChatContextBlock(params: { knowledgeBlock: string; conversationBlock?: string }) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

/**
 * 作品编辑：只做文字二改/润色、公众号排版、小红书图文改写。
 * 深度长文 / 从零写稿已并入 content_producer，不要在这里抢活。
 */
export class WorkEditorHandler implements AimAgentHandler {
  agentId = "work_editor" as const

  /** 作品编辑产出以成稿正文为主；排版/图文也落在 raw_copy */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy", "wechat_article"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    const latestUser = [...(params.messages ?? [])]
      .reverse()
      .find((m) => m?.role === "user" && typeof m?.content === "string")?.content || ""
    const workflowContext = buildWorkflowContext({
      taskSpec: params.taskSpec,
      rawInput: latestUser,
      runtimeTask: params.runtimeTask,
    })

    const isLightEdit = params.runtimeTask === "light_edit"
    const lightEditBlock = isLightEdit ? `\n${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : ""
    // 互斥约束：light_edit（局部润色）不注入「高风险任务验证规则 / 验证结果区块」。
    // 该规则自身声明「局部润色、单句改写不要追加验证结果区块」；若在 light_edit 下注入，
    // 模型会同时收到「保留原文、只改局部」与「追加验证结果区块」两个相反指令。
    const highRiskBlock = isLightEdit ? "" : `\n${AIM_HIGH_RISK_LOOP_RULE}`
    return `你是「作品编辑」，只做三件事：文字二改/润色、公众号排版、小红书图文改写。
默认输入是已有成稿或素材。不要从零写深度长文或公众号新稿；用户要新写长文时，明确提示去「内容创作」。

北极星目标：${AIM_NORTH_STAR_GOAL}

企业已有核心知识库（参考背景）：
${contextBlock}
${workflowContext ? `\n工作流任务单：\n${workflowContext}\n` : ""}
IP操盘方法论（编辑时的强参考，不得整段抄进回复）：
${params.methodologyBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}
${lightEditBlock}${highRiskBlock}

你的对话原则：
1. 先判断用户当前要做哪一类：文字二改/润色、公众号排版，还是小红书图文改写；直接输出对应成品，不强制先出框架、不追问一堆问题。
2. 润色：保留作者立场、关键事实和真实数据，明显去 AI 味，纠正错别字和病句；不要擅自改主题或扩写成全新长文。
3. 公众号排版：优化段落长度、补充小标题、梳理开篇钩子和结尾引导；配图位置用【配图：说明】标注；输出可直接用于公众号的正文。
4. 小红书图文：输出标题 5 个、封面主标题/副标题、正文、2-5 个话题标签、8 页图文结构与逐页配图脚本；每页只讲一个信息点。
5. 若用户没有提供成稿/素材却要求「写一篇深度文章/从零起稿」，简短说明应改用「内容创作」，并询问是否已有成稿需要编辑。
6. 正文最后一句写完就停止，不要追加拆分方向、私域话术、其他平台分发内容或「你看是否符合」这类确认尾句。
7. 热点只能自然融合，禁止硬蹭或编造。
8. 如果用户要求把成稿整理成发布文案/发布话题/发布包，必须遵守：
${PUBLISH_PACKAGE_CHAT_RULE}
9. ${AIM_SESSION_PRIORITY_RULES}

请直接根据上文与用户的历史对话，产出下一轮内容。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const allowed = context.targetFormats.filter((f) =>
      WorkEditorHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const safeTargets = allowed.length > 0 ? allowed : ["raw_copy" as ContentFormat]

    const agentPrompt = `你是「作品编辑」，只做文字二改/润色、公众号排版或小红书图文改写。
输入应是已有成稿或素材。禁止从零写深度长文；若输入明显是「请写一篇全新长文」且没有成稿，输出一句引导去「内容创作」，不要硬写长文。

【核心输出规则 — 严格遵循】
- 先判断本轮是：润色 / 公众号排版 / 小红书图文改写，只输出对应一类成品。
- 润色：保真、去 AI 味、不改立场与关键数据；默认保留篇幅，除非用户明确要求精简。
- 公众号排版：小标题 + 可读段落 + 【配图：说明】；不要另起全新选题。
- 小红书图文：标题、封面、正文、话题、逐页脚本一次给齐。
- 正文最后一句写完就停止；禁止拆分方向、私域话术、多平台二次分发、确认尾句。
- 热点只能自然融合，禁止硬蹭或编造。
- 不暴露外部参考来源细节。`

    const knowledgeSection = context.knowledgeBlock?.trim()
      ? context.knowledgeBlock
      : `【知识库状态】当前未检索到与本次编辑相关的知识库内容。
降级策略：完全基于用户提供的成稿/素材完成编辑，不要编造企业案例或事实。`

    const systemPrompt = `${agentPrompt}

${knowledgeSection}
${context.methodologyBlock
  ? `IP操盘方法论（编辑时参考）：\n${context.methodologyBlock}`
  : ""}
${context.eventStorytellingBlock}
${context.ipWikiBlock ? `${context.ipWikiBlock}\n` : ""}
${context.runtimeTask === "light_edit" ? `${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : ""}
请严格按照用户指定的编辑类型输出，不要添加解释、点评或确认尾句。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始内容：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}请按作品编辑职责输出成品（润色 / 公众号排版 / 小红书图文）。若没有成稿却要求新写深度长文，只输出引导去内容创作的简短说明。`

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      safeTargets,
    )

    const rawText = ensureContentCreationTrace(parsed.raw_copy || parsed.wechat_article || completion.content, context)
    const traced = { ...parsed, raw_copy: rawText }
    const record = await saveAimGenerationRecord(context, completion, traced)

    return {
      id: record.id,
      results: safeTargets.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
      taskSpec: (record as { taskSpec?: import("@/lib/task-spec").TaskSpec }).taskSpec,
    }
  }
}
