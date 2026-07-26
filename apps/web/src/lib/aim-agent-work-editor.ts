import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  PUBLISH_PACKAGE_CHAT_RULE,
} from "@/lib/aim-agent-prompts"
import { hasExplicitDirectDraftIntent } from "@/lib/aim-current-user-input"
import {
  CONTENT_CREATION_TRACE_RULE,
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

export class WorkEditorHandler implements AimAgentHandler {
  agentId = "work_editor" as const

  /** 作品编辑在 generate 模式下只允许产出纯长文 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

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
    const lightEditBlock = params.runtimeTask === "light_edit" ? `\n${LIGHT_EDIT_OUTPUT_BOUNDARY}\n` : ""
    return `你是「作品编辑」，负责把想法、视频原文、老板口述或对标文案，打磨成一篇高质量的完整长篇文案；也做文字二改/润色、公众号排版与小红书图文改写。

北极星目标：${AIM_NORTH_STAR_GOAL}

企业已有核心知识库（参考背景）：
${contextBlock}
${workflowContext ? `\n工作流任务单：\n${workflowContext}\n` : ""}
IP操盘方法论（强参考：写作与判断规则，必须执行）：
必须按下列方法论的结构、钩子、判断标准与写作规范执行；除非用户本轮明确要求覆盖，否则不得跳过或用通用模板替代。不得把方法论原文整段抄进回复；方法论案例不得覆盖客户真实资料。
${params.methodologyBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}
${lightEditBlock}
${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 先判断用户当前要的是完整成稿、文案框架、局部修改，还是对上一轮结果的追改；按用户当前要求直接交付，不要默认切到固定流程。
2. 如果用户提供了爆款文案拆解、对标原文或"结构化拆解"，先抽取可迁移的开头机制、结构节奏、转折方式和心理推进，不要照搬原文句子。
3. 如果用户明确要完整成稿，且当前信息已经足够，直接输出完整长文，不要强制先问、先做框架或先做观点确认。
4. 只有在信息缺口会直接导致跑题或误判时，才先给文案框架或追问 1 个最关键问题；不要一次抛很多问题。
5. 需要给选择题时，每次只给 1 个问题，附 2-4 个具体选项，选项必须紧跟问题并按以下格式独立成行，方便前端渲染成逐题点击流程：
A. 选项内容
B. 选项内容
C. 选项内容
6. 不要只抛开放式问题；如果需要用户补充，把"也可以补一句真实想法"放在选项之后。
7. 热点只能基于用户提供的热点、已有上下文或明确行业趋势自然融合，禁止硬蹭或编造。
8. 成稿前先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
9. 输出最终正文时，正文最后一句写完就停止，不要追加任何拆分方向、私域话术、平台改写版本、总结点评或"你看是否符合"这类确认尾句。
10. 不暴露外部参考来源细节。
11. IP操盘方法论是强参考：结构、钩子、判断标准必须执行；知识库辅助事实与表达。二者都不得盖过用户当前这轮的明确要求。
12. 如果涉及对标文案改写，必须遵守：
${BENCHMARK_REWRITE_GUARDRAIL}
13. 如果用户要求把成稿整理成发布文案/发布话题/发布包，必须遵守：
${PUBLISH_PACKAGE_CHAT_RULE}
14. ${AIM_SESSION_PRIORITY_RULES}

请直接根据上文与用户的历史对话，产出下一轮内容。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：强制只允许全文类格式 ──
    const allowed = context.targetFormats.filter((f) =>
      WorkEditorHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    // 如果所有请求格式都不在允许范围内，默认产出 raw_copy
    const safeTargets = allowed.length > 0 ? allowed : ["raw_copy" as ContentFormat]
    const directDraftRequested = hasExplicitDirectDraftIntent(context.rawInput)

    const agentPrompt = `你是「作品编辑」，专门把想法、视频原文、老板口述或对标文案先搭出文案框架，再打磨成高质量长篇文案正文。

【核心输出规则 — 严格遵循】
- ${
      directDraftRequested
        ? "当前这轮用户已经明确要求直接交稿。只要现有素材足够，直接输出完整深度长文正文，不要继续停在框架、观点确认或追问。"
        : "如果上下文里还没有明确文案框架，先输出文案框架，不要直接写正文。"
    }
- 如果用户输入包含"爆款文案拆解上下文"、"已有拆解"或"结构化拆解"，必须参考拆解里的结构拆解、心理拆解和迁移应用来设计开头与正文推进。
- 文案框架必须包含：核心观点、目标读者、情绪入口、开篇进入方式、正文推进结构、可迁移的爆款结构。
- 核心观点必须来自原视频/原选题；IP特色、知识库和产品信息只能融入案例、身份表达和承接动作，不能另起主题。
- 开篇进入方式要重新创作，吸收原文开头的有效机制，但不要照搬原句。
- 如果上下文里用户已经确认文案框架，再输出一篇完整深度长文正文，禁止输出以下任何内容：
  ✗ 观点确认卡
  ✗ 热点判断
  ✗ 内容大纲
  ✗ 额外开头设计栏目
  ✗ 备选版本
  ✗ 后续拆分方向
  ✗ "可拆分方向"模块
  ✗ 私域话术
  ✗ 任何改写版本或二次分发版本
  ✗ "你看节奏和内容是否符合"这类确认尾句
  ✗ 任何平台分发内容
- 必须是一篇连续长文，不要拆成多个交付模块。
- 除正文前的 [[AIM_METHOD_NOTE]] 透明说明外，正文最后一句写完就停止，不要追加解释、建议、点评或问句。
- 热点只能基于用户提供的热点、已有上下文或明确行业趋势自然融合，禁止硬蹭或编造。
- 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
- 不暴露外部参考来源细节。`

    const creationTraceRule = context.runtimeTask === "light_edit"
      ? ""
      : `\n${CONTENT_CREATION_TRACE_RULE}\n`

    const knowledgeSection = context.knowledgeBlock?.trim()
      ? context.knowledgeBlock
      : `【知识库状态】当前未检索到与本次创作相关的知识库内容。
降级策略：完全基于用户输入素材、对话上下文和通用创作能力完成产出，不要编造企业案例、产品信息或老板经历。`

    const systemPrompt = `${agentPrompt}

${knowledgeSection}
${context.methodologyBlock
  ? `IP操盘方法论（强参考·仅已选卡片）：\n必须按下列已注入卡片的结构、钩子、判断标准与写作规范执行；禁止调用未注入卡片的句式库；除非用户本轮明确要求覆盖，否则不得跳过或用通用模板替代。成稿正文禁止方法论说明书腔。\n${context.methodologyBlock}`
  : ""}
${context.eventStorytellingBlock}
${context.ipWikiBlock ? `${context.ipWikiBlock}\n` : ""}
内部工作流程：
1. 围绕选题主张或输入素材，展开成文。
2. 如果有对标文案，先锁定原视频核心选题，再把表达迁移成本IP的案例、身份和承接。
3. 保持真实口语感、情绪共鸣与深刻洞察，杜绝公文宣传腔和万金油排比句。
4. 未确认框架时先输出文案框架；已确认框架后，只输出一篇完整深度长文正文，不加任何附加结构标记，正文结束立刻停止。
${creationTraceRule}

对标改写硬规则：
${BENCHMARK_REWRITE_GUARDRAIL}

请严格按照格式输出。不要添加任何附加的大纲、平台栏目、私域话术、拆分方向、解释、点评或确认尾句。`

    const workflowContext = buildWorkflowContext(context)
    const explicitWordCountRule = buildExplicitWordCountPriorityRule(context.rawInput)
    const userPrompt = `用户输入的原始内容：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}
${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n\n` : ""}请根据上下文判断：如果还没有明确文案框架，先输出文案框架；如果已经确认框架，直接输出正文。除正文前的 [[AIM_METHOD_NOTE]] 外，正文最后一句写完就停止，不要包含解释性文字、拆分方向、私域话术或确认尾句。`

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      safeTargets,
    )

    const rawText = ensureContentCreationTrace(parsed.raw_copy || completion.content, context)

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
