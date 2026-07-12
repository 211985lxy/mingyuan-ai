import type { AimModelPolicy } from "@/lib/aim-harness/types"
import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { getAimGenerationUsage, saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"
import { buildBusinessDiagnosisMethodologyBlock } from "@/lib/business-diagnosis-methodology"
import { fireKnowledgeEmbedding } from "@/lib/aim-knowledge-context"
import {
  type ResolvedKnowledgeStrategy,
  type AimRuntimeTask,
} from "@/lib/aim-knowledge-strategy"
import { compressAimMessages } from "@/lib/aim-context-compressor"
import { applyAimContextBudget } from "@/lib/aim-context-budget"
import { buildIpWikiBlock } from "@/lib/ip-wiki/context"
import {
  ContentFormat,
  AimTaskType,
  parseMultiFormatResponse,
} from "./aim-generator"
import {
  addAimTraceStep,
  finishAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { buildScenarioPromptBlock, type ContentScenario } from "@/lib/content-scenario-config"
import { AIM_OUTPUT_MAX_CHARS, buildExplicitWordCountPriorityRule } from "@/lib/aim-benchmark-length"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  FORMAT_INSTRUCTIONS,
  PUBLISH_PACKAGE_CHAT_RULE,
  buildContentProducerChatPrompt,
} from "@/lib/aim-agent-prompts"
export {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
  buildContentProducerChatPrompt,
  buildXhsVisualDirectorInstruction,
} from "@/lib/aim-agent-prompts"
import {
  benchmarkCopyReuseRatio,
  extractBenchmarkOriginalCopy,
  isBenchmarkCopyTooSimilar,
} from "@/lib/aim-benchmark-quality"
import { hasExplicitDirectDraftIntent, hasWechatDraftIntent } from "@/lib/aim-current-user-input"
import {
  buildConversationIntentBlock,
  resolveAimConversationIntentWithRules,
  type AimConversationMode,
  type AimConversationIntent,
} from "@/lib/aim-conversation-intent"
// 身份契约唯一源：AimAgentId / 运行时校验 / 别名归一化统一来自这里。
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import {
  AIM_AGENT_IDS,
  LEGACY_AGENT_ID_ALIASES,
  DEFAULT_AIM_AGENT,
} from "@/lib/aim-harness/contracts"
// 阶段 2.3：装配下沉。buildAimGeneration 改为 plan + prepareAimContext + handler.generate。
// 注意：这是过渡态——阶段 2.4 executeAimRun 接管编排后，buildAimGeneration 将只接收
// PreparedAimContext，不再反向依赖 harness 模块（届时移除这两行 import）。
import { planAimRun } from "@/lib/aim-harness/planner"
import { prepareAimContext } from "@/lib/aim-harness/context-assembly"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  buildWorkflowContext,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"

// ─── 类型定义 ──────────────────────────────────────────────

// AimAgentId 的唯一事实源在 @/lib/aim-harness/contracts，这里 re-export 以
// 保持现有从 aim-agent-handlers 引入该类型的调用方兼容。
export type { AimAgentId }
export { benchmarkCopyReuseRatio, extractBenchmarkOriginalCopy, isBenchmarkCopyTooSimilar }

export interface AimChatParams {
  userId: string
  projectId?: string
  messages: any[]
  knowledgeBlock: string
  conversationBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  conversationIntent?: AimConversationIntent
  runtimeTask?: AimRuntimeTask
  modelPolicy?: AimModelPolicy
  trace?: AimTraceRecorder
}

export interface AimChatResponse {
  content: string
}

export interface AimGenerateContext {
  userId: string
  agentId: string
  projectId?: string
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: AimTaskType
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  existingGenerationId?: string
  topicSelectionId?: string
  selectedTopicIndex?: number
  taskSpec?: import("@/lib/task-spec").TaskSpec
  runtimeTask?: AimRuntimeTask
  modelPolicy?: AimModelPolicy
  runSpec?: import("@/lib/aim-harness/types").AimRunSpec

  // 共享数据上下文
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  /** 事件内容化方法论（现场/事件复盘类专用，非该类内容时为空串） */
  eventStorytellingBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  retrievedEntries: any[]
  retrievedSource: string
  /** 本次实际生效的知识调用策略（解析后回传，供 UI 反馈） */
  knowledgeStrategy: ResolvedKnowledgeStrategy
  /** 内容场景模式（由前端或路由层传入，驱动提示块和知识策略差异化） */
  contentScenario?: ContentScenario
  trace?: AimTraceRecorder
  /** Eval-only: use frozen context instead of live DB loaders. */
  contextOverride?: AimGenerationContextOverride
  /** Eval-only: execute the production prompt/model path without writing history. */
  skipPersistence?: boolean
}

export interface AimGenerationContextOverride {
  knowledgeBlock: string
  entries: Array<{
    id: string
    title: string
    content: string
    category: string
    tags: unknown
    valueGrade: string | null
    score: number
  }>
  source: "embedding" | "raw"
  viralStructureBlock?: string
  methodologyBlock?: string
  businessDiagnosisBlock?: string
  ipWikiBlock?: string
  eventStorytellingBlock?: string
}

export interface AimGenerateResponse {
  id: string
  results: Array<{
    format: ContentFormat
    content: string
    wordCount: number
  }>
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
  }>
  conversationMode?: AimConversationMode
  /** 本次实际生效的知识调用策略（由 buildAimGeneration 解析后注入，供 UI 反馈） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  /** 协作认知层产物：风险/模式/事实/缺口/假设（由 buildAimGeneration 注入） */
  taskSpec?: import("@/lib/task-spec").TaskSpec
}

export interface AimAgentHandler {
  agentId: AimAgentId
  chat(params: AimChatParams): Promise<AimChatResponse>
  streamChat(params: AimChatParams): AsyncIterable<string>
  generate(context: AimGenerateContext): Promise<AimGenerateResponse>
}

function buildChatContextBlock(params: {
  knowledgeBlock: string
  conversationBlock?: string
}) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}

// ─── 1. 内容生产官 (ContentProducerHandler) ──────────────────

class ContentProducerHandler implements AimAgentHandler {
  agentId = "content_producer" as const

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentProducerChatPrompt(params)
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是一个企业营销内容专家。根据用户提供的信息，结合企业知识库，生成高质量的营销内容。`

    const formatBlocks = context.targetFormats
      .map((format) => FORMAT_INSTRUCTIONS[format])
      .join("\n\n---\n\n")

    const scenarioBlock = buildScenarioPromptBlock(context.contentScenario)
    const systemPrompt = buildProducerSystemPrompt(agentPrompt, context) + scenarioBlock
    const userPrompt = buildUserPrompt(context, formatBlocks)

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      context.targetFormats,
    )

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: context.targetFormats.map((format) => ({
        format,
        content: parsed[format] || "",
        wordCount: (parsed[format] || "").length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 1b. 自由文案创作 (FreeCopywriterHandler) ─────────────────

class FreeCopywriterHandler implements AimAgentHandler {
  agentId = "free_copywriter" as const

  private buildPrompt(params: { knowledgeBlock: string; conversationBlock?: string; ipWikiBlock: string }): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个交货型文案写手，只负责听懂用户当前要求，并把文案直接交出来。

可参考的业务背景：
${contextBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}

规则：
1. 用户怎么要求就怎么写；用户的指令优先级高于模板、方法论、默认字数和系统习惯。
2. 用户要长就写长，用户要短就写短；没有明确字数时按内容自然长度写。
3. 不强制套爆款结构、开头库、结尾库、框架确认、观点池、95%-105% 字数规则或多平台拆分。
4. 不反问、不讲方法论、不输出分析报告；除非用户明确要求，只给一版可直接用的文案。
5. 保留人的语气，少用宣传腔、排比句和空泛总结。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const format = "raw_copy" as ContentFormat
    const systemPrompt = this.buildPrompt(context)
    const userPrompt = `请直接按用户要求写一版文案：
"${context.rawInput}"`
    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const content = completion.content.trim()
    const record = await saveAimGenerationRecord(context, completion, { [format]: content } as Record<ContentFormat, string | undefined>)

    return {
      id: record.id,
      results: [{ format, content, wordCount: content.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 2. 深度文案官 (DeepCopywriterHandler) ─────────────────────

class DeepCopywriterHandler implements AimAgentHandler {
  agentId = "deep_copywriter" as const

  /** 深度文案官在 generate 模式下只允许产出纯长文 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个深度文案官，负责把想法、视频原文、老板口述或对标文案，打磨成一篇高质量的完整长篇文案。

企业已有核心知识库（参考背景）：
${contextBlock}

IP操盘方法论（写作与判断规则）：
${params.methodologyBlock}
${params.ipWikiBlock ? `\n${params.ipWikiBlock}` : ""}

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
11. 方法论和知识库用于辅助判断与打磨，不要拿固定流程压过用户当前这轮的明确要求。
12. 如果涉及对标文案改写，必须遵守：
${BENCHMARK_REWRITE_GUARDRAIL}
13. 如果用户要求把成稿整理成发布文案/发布话题/发布包，必须遵守：
${PUBLISH_PACKAGE_CHAT_RULE}
14. 如果用户要求"结合他的资料/人设/IP故事/来时路自然融入"，要把资料自然化进正文推进、案例、判断和身份表达里，不要单独拼一段资料摘要或履历。
15. 如果用户表达了"别越改越短""保持原稿长度/体量""不要压缩"这类意图，就默认保留当前稿子的主体信息密度和篇幅；除非用户明确要求精简，否则不要主动缩成短版。

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
      DeepCopywriterHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    // 如果所有请求格式都不在允许范围内，默认产出 raw_copy
    const safeTargets = allowed.length > 0 ? allowed : ["raw_copy" as ContentFormat]
    const directDraftRequested = hasExplicitDirectDraftIntent(context.rawInput)

    const agentPrompt = `你是一个深度文案官，专门把想法、视频原文、老板口述或对标文案先搭出文案框架，再打磨成高质量长篇文案正文。

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
- ${BENCHMARK_REWRITE_GUARDRAIL}
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
- 正文最后一句写完就停止，不要追加解释、建议、点评或问句。
- 热点只能基于用户提供的热点、已有上下文或明确行业趋势自然融合，禁止硬蹭或编造。
- 先保住人的位置、代价和手迹，再清理 AI 腔、宣传腔、整齐排比和万能结尾。
- 不暴露外部参考来源细节。`

    const systemPrompt = `${agentPrompt}

${context.knowledgeBlock}
${context.methodologyBlock}
${context.eventStorytellingBlock}
${context.ipWikiBlock ? `${context.ipWikiBlock}\n` : ""}
内部工作流程：
1. 围绕选题主张或输入素材，展开成文。
2. 如果有对标文案，先锁定原视频核心选题，再把表达迁移成本IP的案例、身份和承接。
3. 保持真实口语感、情绪共鸣与深刻洞察，杜绝公文宣传腔和万金油排比句。
4. 未确认框架时先输出文案框架；已确认框架后，只输出一篇完整深度长文正文，不加任何附加结构标记，正文结束立刻停止。

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

${explicitWordCountRule ? `字数冲突处理：${explicitWordCountRule}\n\n` : ""}请根据上下文判断：如果还没有明确文案框架，先输出文案框架；如果已经确认框架，直接输出正文。正文最后一句写完就停止，不要包含解释性文字、拆分方向、私域话术或确认尾句。`

    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      safeTargets,
    )

    const rawText = parsed.raw_copy || completion.content.trim()

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: safeTargets.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 3. 商业诊断官 (BusinessSystemDiagnosisHandler) ───────────

class BusinessSystemDiagnosisHandler implements AimAgentHandler {
  agentId = "business_system_diagnosis" as const

  /** 商业诊断官仅产出诊断报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个企业商业诊断官，正在帮助用户做一次生意系统体检。

企业已有核心知识库（参考背景）：
${contextBlock}

商业诊断方法论（内部判断规则，仅供你自己判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${params.businessDiagnosisBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话路由（必须先判断用户的问题是否成立，再决定怎么回答）：
1. 先判断问题是否成立：按方法论里的「问诊消解漏斗」从上往下判断，命中即在该层处理，不要跳到体检。
   - 信息类问题（行业标准/平台规则/合规边界）：能答的直接简短答完；拿不准的提示查官方资料，不要编数字。
   - 情绪类问题（抱怨/发泄/求认同）：共情一句，把对话拉回可诊断的事实层，不要套诊断框架。
   - 语言陷阱（高端/适合/值得/定位不清/流量差/转化差等模糊词）：先要求用户说清到底指什么，不直接给方案。
   - 假设错误（有流量就能成交、产品好就该卖、发得多就会爆、对标能成我也能）：先点破站不住脚的前提。
   - 逻辑错误（相关性当因果、个别对标当可复制、单点数据下全局结论）：先纠正推理方式。
   - 事实前提不清（缺关键数据/自相矛盾）：先要求给出关键数据。
2. 当问题成立但信息还不足时：每次只追问一个最关键问题，并给出 2-4 个可选答案让用户选择，不要做开放式填空。
3. 重点围绕业务类型、现状数据、真实目标、约束条件、验收标准追问。
4. 只有当问题成立、关键事实已校准、且用户有产品/案例/资源/时间或执行意愿时，才提醒用户可以点击【一键生成】生成完整诊断报告。在此之前不要生成报告。
5. 不要让用户做开放式填空题；如果必须开放补充，把它放在选项之后，作为"也可以补充具体情况"。
6. 统一呈现为生意系统体检，不解释内部方法来源。

请直接根据上文与用户的历史对话，产出你下一轮的建议或追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 诊断报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessSystemDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = `你是一个企业商业诊断官，负责根据与用户的沟通事实，结合企业知识库，生成专业的生意系统体检报告。

商业诊断方法论（体检评判准则，仅供你判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${context.businessDiagnosisBlock}

企业已有核心知识库（参考背景）：
${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

体检报告必须严格按以下八段固定结构输出，缺一不可，顺序不可调换：

## 业务现状说明
把口语化抱怨整理成可诊断的现状：主体边界、现状数据（营收/流量/咨询/成交/客单价/复购/成本）、真实目标、约束条件。

## 模糊概念澄清
点出本轮必须拆掉的模糊词（如高端/适合/定位不清等），给出真实定义和不能继续混用的词。

## 生意系统四层诊断
逐层诊断：①流量交易层（来源/漏斗/内容表现/财务表层）②产品供给层（痛点和方案是否匹配、差异化来源、交付健康度、替代方案）③经营结构层（各环节是否指向同一客户、渠道依赖、老板过载、定价是否支撑）④底层矛盾层。

## 核心矛盾判断
只给 1 个核心矛盾（不列一堆问题吓人），可附 2-3 个次要矛盾。

## 行业参照校验
用同体量、同模式、投产、风险、可复制 5 个维度校验，给出可参考规律和不可盲目模仿的部分。

## 多视角复核
从事实、直觉、风险、机会、创新、收束 6 个视角压测。

## 三条调整路径
保守改良 / 中度调整 / 模式重构，各给一条。

## 本周最小动作
只给一个本周就能做、且最重要的小动作。

输出硬约束：
- 只给 1 个核心矛盾，不堆砌问题清单。
- 每条建议必须绑定资源、人力、时间、风险，不说"多做内容""做好私域"这类空话。
- 不承诺结果。
- 【禁止输出】短视频脚本、朋友圈文案、社群文案、拍摄交接单、公众号文章、小红书图文等任何营销分发内容。
- 统一呈现为生意系统体检，不解释内部方法来源。
直接输出报告，不输出无关大纲、钩子或营销分发内容，不要任何 AI 官腔。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始信息与对话记录：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份详细的"生意系统体检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 4. 定位策划官 (BusinessDiagnosisHandler) ────────────────

class BusinessDiagnosisHandler implements AimAgentHandler {
  agentId = "business_diagnosis" as const

  /** 定位策划官仅产出定位方案 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个定位策划官，负责帮助用户明确 IP 定位、人设定位、内容定位和初始成交路径。

企业已有核心知识库（参考背景）：
${contextBlock}

IP操盘方法论（内部判断规则，只能用于推理，不得原样展示给用户）：
${params.methodologyBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 只处理 IP 本身：这个人如何站出来、被谁信任、讲什么内容、承接什么产品。
2. 先判断用户当前在走哪条路由：
   - 选题策划路由：用户在反复确认账号方向、选题方向、内容栏目、爆款角度时，交互式输出 3-5 个可选选题方向，并追问最影响选择的一个问题。
   - 日更100条选题路由：用户提到日更、100条、选题库、内容日历、长期选题、每天发什么时，直接输出完整 100 条选题库，不要只给 3-5 条。
   - 纯会议纪要整理路由：用户明确说「纯整理会议纪要」「只做会议纪要整理」「不要选题」「不要任务清单」「不用做其他动作」「只要纪要」时，先只输出会议纪要整理结果；整理完成后默认停在这里，不自动继续生成选题、清单、脚本方向或其他资产化动作，除非用户下一轮再明确提出。
   - 会议纪要内容资产包路由：用户提供会议纪要/访谈逐字稿，并要求整理、生成选题、任务清单、拍摄清单、采访问题、脚本模板时，输出一份可执行的内容资产包，而不是只给 3-5 条选题。
   - 核心选题交接路由：用户明确说只要一个核心选题、直接进入下一步文案、不要完整整理时，只输出一个最值得拍的选题和给文案智能体的交接说明。
   - 工具包单项路由：用户只要求任务清单、采访清单、问卷表或脚本模板中的某一种时，只输出该单项工具，不顺手展开完整资产包。
   - 完整 IP 策划路由：用户要求定盘、策划方案、IP 全案（但未明确要求天命操盘全案）时，提醒可点击【一键生成】交付完整方案。
   - 人设卖点梳理路由：用户提供采访稿、成长经历、客户人设素材时，先提炼人设卖点、差异化特色、可信证据和可表达角度。
   - 天命IP资产化操盘全案路由：当用户明确提到「天命IP」「资产化」「操盘全案」「12 模块」，或对话上下文来自商业诊断官（生意系统体检）并要求进一步做 IP 全案时，走这条路由。该路由输出固定 12 个客户结果段（项目总判断、天命底盘、IP主定位、目标客户、核心问题、IP价值、产品设计、内容系统、流量闭环、私域成交、交付资产化、行动处方），每段都必须基于客户知识库/客户资料/本轮上下文推导；方法论只做后台判断，不得把方法论名称、公式、模块解释原样呈现给用户。没有八字/紫微资料时，天命底盘写「未提供/待补充」，不编造命理。
   - 知识库驱动选题路由：当用户明确要求「基于知识库」「根据知识库做选题」「基于人设故事」「知识库选题」「选题加文案结构」「基于采访素材做选题」，或本次对话上下文里已经选中了较完整的客户知识库（老板经历/人设素材）且要求做选题时，走这条路由。该路由必须基于客户知识库里的真实人物、真实事件、真实金句生成选题，严禁编造人物/数字/事件。
3. 日更100条选题路由必须先展示"选题方法论底盘"，且只能使用四类选题方法论：
   - 热点类：结合当前行业、平台和对标账号正在发生的热点，但必须回到本账号的产品、客户和观点，不硬蹭。
   - 人设类：让用户相信"这个人靠谱、懂我、值得听"；适合来时路、价值观、专业经历、踩坑、工作现场、vlog。
   - 问题解答类：站在客户角度，把痛点、顾虑、案例和业务价值讲清楚，再给解决方案；适合痛点拆解、避坑指南、客户问答、案例拆解、方法清单。
   - 观点类：输出自己的判断、立场、反常识和行业认知；适合趋势判断、旧认知纠偏、老板认知、争议话题。
4. 日更100条选题路由的 100 条表格字段固定为：编号、选题标题、选题类型、目标用户、切入角度、可拍内容、承接目的；选题类型只能从上述四类中选择。
5. 信息不足时，优先追问能影响当前路由结果的关键问题，每次只追问一个，并给出 2-4 个可选答案让用户选择；但用户明确要日更100条选题时，不要追问，基于现有资料直接生成。
6. 不要让用户做开放式填空题；选项必须具体，例如"专家型 / 老板实战型 / 陪伴型 / 行业观察型"。
7. 全站选题策划的基准线是整体 IP 操作方案/客户项目全案：任何选题先对齐目标客户、主产品/服务、成交路径、交付目标和账号定位。会议纪要、热点、对标、客户痛点、问卷和采访清单只是素材来源，用来补充钩子、证据、真实问题和执行动作，不得覆盖基准线。不同选题再匹配不同知识库资料：问题解答类优先客户痛点/客户问答/会议纪要，转化类优先产品卖点/项目案例/成交记录，人设类优先老板经历/定位素材，热点类优先行业信源/对标动态。
8. 只有用户明确要求「基于会议纪要/调用会议纪要」，或本次选题素材明确选中了会议纪要时，才把会议纪要作为主要依据，并从客户原话、真实问题、分歧、案例、顾虑和下一步动作中拆选题。
9. 纯会议纪要整理路由固定输出：
   - 会议主题：这场会在讨论什么。
   - 会议目的：这场会想解决什么问题；没有明确目的就写「未明确说明」。
   - 参会角色：只写本次材料里能确认的角色与分工，不编造身份。
   - 核心结论：提炼 3-5 条本次会议已经说清楚的结论。
   - 逐段纪要：按讨论顺序整理，每段固定为「讨论点 / 关键信息 / 原话或事实依据」。
   - 已确认事项：会里明确说定了什么。
   - 待确认事项：会里提到了但还没说清的点。
   - 原话摘录：保留最关键的 3-8 句原话。
   - 待补充信息：只列缺口，不补建议。
   纯会议纪要整理路由硬约束：不要输出选题池、优先级、执行清单、采访清单、脚本/分镜、知识库素材、承接目的、下一步动作；整理完成后默认停止，不自动衔接后续动作。
10. 会议纪要内容资产包路由必须高密度，不做流水账总结。固定输出：
   - 会议一句话结论：这场会真正要解决什么内容/获客/成交问题。
   - 关键信息抽取表：原话/事实、说话对象或角色、暴露的问题/顾虑/机会、可转成的内容角度、证据强度。至少 8 条；材料不足时写实际可提取条数，不编造。
   - 核心矛盾/机会：只给 1 个主矛盾和 2-3 个次矛盾，必须对应会议里的原话或事实。
   - 可拍选题池：至少 12 条；每条字段固定为选题标题、选题类型、目标受众、会议证据、开头钩子、拍摄场景/素材、承接目的。
   - 优先级最高的 3 条：说明为什么先拍，必须结合信任建立、转化价值、现场可拍性。
   - 执行清单：任务、负责人/角色、输入材料、交付物、验收标准。
   - 采访追问清单：采访对象、问题、追问、想拿到的原话/证据。
   - 脚本/分镜方向：只给方向和开头钩子，不直接写完整脚本，除非用户明确要脚本。
   - 可沉淀知识库素材：人物事实、项目事实、客户痛点、产品卖点、案例证据、待补充信息。
   会议纪要资产包禁止只写“三个方向、三个账号”这类空泛概括；禁止结尾反问“是否需要我展开脚本/继续生成”，直接给下一步最小动作。
11. 核心选题交接路由只输出：核心选题标题、为什么只选它、目标受众、开头钩子、内容主线、必用会议原话/事实、文案创作交接说明。不要输出选题库、长任务清单、完整分镜和多个备选。
12. 工具包单项路由要克制：任务清单只给执行表；采访清单只给采访对象和问题；问卷表只给问题和题型；脚本模板只给文案创作模板。不要混在一起输出。
13. 如果缺少关键依据，优先追问可调用的数据来源，例如会议纪要、对标账号、历史爆款、客户画像、成交记录、行业报告或企业知识库素材。
14. 如果企业知识库里出现【对标账号监控数据】，用户问近期作品、发了什么、账号特点时，直接基于这些作品列表回答，并说明这是最近一次刷新缓存，不要泛泛建议用户去看数据。
15. 知识库驱动选题路由（F 路由）的固定约束：
   - 先从客户知识库抽取真实素材：人物身份/经历/铁证标签/反差点/至暗时刻/高光时刻/原生家庭冲突/识人案例/金句原话，列在「素材锚点」段，每条素材必须标注来自知识库哪一处。
   - 产出约 8-12 条选题，每条固定字段：选题一句话标题、内容路由类型（人设信任型/观点立场型/问题解决型/案例转化型）、叙事引擎、开头钩子类型、价值观锚点、对应的知识库素材来源。
   - 叙事引擎铁律（核心纠错）：人设信任型选题用「故事弧线5拍」（困难→冲突→内心矛盾→解决→结果），严禁用 5A 漏斗；观点立场型/问题解决型/案例转化型可用 5A（Aware→Appeal→Ask→Act→Advocate）。理由：人设型靠故事建信任，5A 是转化漏斗，硬套会把故事讲成带货感。
   - 每条人设型选题必须显式点出「内心矛盾」那一拍（主人公内心怎么纠结/两难/挣扎），这是 5A 里没有、故事弧线独有的引擎。
   - 守人设红线：不立霸道总裁、不卖惨、不仇富、不神化投资；客户/合伙人姓名按知识库里的脱敏规则匿名化。
   - 知识库不足时，不要追问填空，直接按现有素材生成，并在缺口处标注「待补充」。

请直接根据上文与用户的历史对话，产出你下一轮的建议或追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 定位方案 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = `你是一个定位策划官，负责为企业老板明确 IP 营销的全局定位与成交路径方案。

企业已有核心知识库（参考背景）：
${context.knowledgeBlock}

IP操盘方法论（内部判断规则，只能用于推理，不得原样展示给用户）：
${context.methodologyBlock}

${AIM_HIGH_RISK_LOOP_RULE}

策划方案输出结构要求：
先判断用户输入最适合哪条交付路由，并按该路由输出，不要把四种结果混在一起：

A. 选题策划路由（反复确认选题）
1. 当前选题判断：用户真正想抢占的目标人群、需求场景和内容机会。
2. 选题候选：给 3-5 个可执行选题方向，每个包含选题名、目标人群、切入角度、可拍内容、为什么值得做。
3. 筛选建议：标出优先级最高的 1-2 个，并说明依据。
4. 下一轮确认问题：只问一个最关键问题，帮助继续收窄选题。

B. 日更100条选题路由
触发词：日更、100条、选题库、内容日历、长期选题、每天发什么。
触发后不要只给 3-5 条，直接输出 100 条选题库。输出前必须先展示"选题方法论底盘"，且只包含以下四类：
1. 热点类：结合当前行业、平台和对标账号正在发生的热点，但必须回到本账号的产品、客户和观点，不硬蹭。写法是先抓热点变化，再讲它和目标客户有什么关系，最后落到自己的判断或方案。
2. 人设类：让用户相信"这个人靠谱、懂我、值得听"。适合来时路、价值观、专业经历、踩坑、工作现场、vlog。写法是先给一个真实场景或经历，再说这个经历形成了什么判断，最后落到用户为什么可以信任你。
3. 问题解答类：站在客户角度，把他们关心的问题、痛点、顾虑、案例和业务价值讲清楚，再给自己的解决方案。适合痛点拆解、避坑指南、产品如何解决问题、客户常见问题答疑、案例拆解、方法清单。
4. 观点类：输出自己的判断、立场、反常识和行业认知。适合趋势判断、旧认知纠偏、老板认知、争议话题。写法是先给明确判断，再拆普通人为什么会判断错，最后给自己的判断标准。

100 条选题表字段固定为：编号、选题标题、选题类型、目标用户、切入角度、可拍内容、承接目的。选题类型只能是：热点类、人设类、问题解答类、观点类。

C. 纯会议纪要整理路由
触发词：纯整理会议纪要、只做会议纪要整理、只要纪要、不要选题、不要任务清单、不用做其他动作。
固定输出：
1. 会议主题：这场会在讨论什么。
2. 会议目的：这场会想解决什么问题；没有明确目的写「未明确说明」。
3. 参会角色：只写材料里能确认的角色与分工。
4. 核心结论：3-5 条已说清楚的结论。
5. 逐段纪要：按讨论顺序整理，每段固定为「讨论点 / 关键信息 / 原话或事实依据」。
6. 已确认事项：明确说定了什么。
7. 待确认事项：提到了但还没说清什么。
8. 原话摘录：最关键的 3-8 句原话。
9. 待补充信息：只列缺口，不给动作建议。
硬约束：不要输出选题池、优先级、执行清单、采访清单、脚本/分镜、知识库素材、承接目的、下一步动作；整理完成后默认停止，不自动衔接后续动作。

D. 完整 IP 策划路由
1. 关键数据来源与依据：先列出本次实际使用的依据，至少区分用户输入、企业知识库/定位素材、已分析对标账号/爆款样本、行业/平台数据；没有调用到的数据必须标明"未提供/待补充"，不得编造来源。
2. 账号分析参考来源：必须把【市场洞察爆款作品上下文】或【对标账号监控数据】作为账号分析参考来源；至少归纳对标账号的内容母题、爆款钩子、受众假设、表达风格、可迁移点和不可迁移点。没有这类数据时写"已分析对标账号：未提供/待补充"。
3. 数据分析、数据来源、数据精选：只保留能影响定位判断的数据，说明每条数据支持了哪个结论；对标账号智慧可以做综合归纳，但必须标为"对标综合判断"，不能伪装成精确统计。
4. IP定位主张：一句话的差异化定位口号（Slogan）及核心目标受众画像。
5. 人设特点的真正挖掘：从经历、能力证据、表达气质、价值观、反差点、信任来源里提炼人设，不只堆"专家/老师/陪伴者"标签。
6. 核心点位设计：必须包含定位点位、人设点位、内容点位、信任点位、成交点位、差异化点位；每个点位说明"为什么成立"和"后续内容怎么体现"。
7. 核心内容体系规划：梳理 3 大核心内容方向/选题专栏，并设计爆款选题示范。
8. 初始成交路径设计：用户从刷到短视频、进粉丝群，到最终加私域成交的完整路线指引。
9. 内容策略底盘：话题分布建议（含建议比例）、内容形式占比、钩子模式、发布频率与最佳时段、爆款公式。

E. 人设卖点梳理路由（采访/人设素材）
1. 人设素材摘要：只提炼事实，不美化、不补编。
2. 人设卖点：提炼 3-5 个可被用户记住的卖点，每个必须对应原始素材里的证据。
3. 差异化特色：指出这个人和同类 IP 不一样的经历、气质、能力或价值观。
4. 表达资产：输出可用于主页简介、置顶视频、选题栏目和转化页的表达角度。
5. 缺口问题：列出还缺的 1-3 类证据，方便继续采访。

F. 天命IP资产化操盘全案路由
触发条件（满足任一即走本路由，不走 A-E）：
- 用户明确提到「天命IP」「资产化」「操盘全案」「12 模块」「商业验证后」；
- 上下文来自商业诊断官（生意系统体检），并要求进一步做 IP 全案或操盘框架。
输出固定 12 个客户结果段（顺序固定，缺一不可）：
1. 项目总判断：一句话判断核心问题——"这个 IP 当前不是【表面问题】，而是【底层问题】"，附当前阶段判断、最大卡点、优先解决方向。
2. 天命底盘：从主理人的八字/紫微判断适合的身份路线、站前台还是幕后、强项方向、不适合硬装的方向；只用于商业表达和人设校准，不做玄学展示。没有命理资料时写"未提供/待补充"，基于已知经历、能力、表达气质做推断判断，绝不编造命理结论。
3. IP 主定位：直接给出适合该客户的主身份、目标人群、核心问题、一句话定位、不建议使用的标签，并说明分别来自客户知识库里的哪些事实或本轮输入；不要展示"定位公式"或占位模板。
4. 目标客户：只抓最值得成交和最适合交付的人；输出核心客户、不适合客户、客户筛选标准。
5. 核心问题：区分客户表面需求（流量/涨粉/课程/工具/话术）和真实问题（身份不清、经验没产品化、内容没信任感、私域没承接、成交没诊断逻辑、交付没沉淀）。
6. IP 价值：结合客户已提供的经历、能力、案例、用户需求、信任资产、产品承接和交付复用潜力，输出价值判断、变现潜力、当前最值得放大的优势、当前最需要补齐的短板；不要展示方法论公式。
7. 产品设计：从"客户愿意为什么结果付费"出发；输出产品阶梯（引流品→低客单→中客单→高客单）、主推产品、高客单成果包、产品边界、升级路径；高客单卖成果不卖时间。
8. 内容系统：围绕定位和成交搭栏目（认知类/方法类/案例类/转化类）；输出内容主线、内容栏目、选题方向、置顶视频方向、转化型内容设计。
9. 流量闭环：内容触达→互动→领资料→加微信→填诊断→进社群/咨询→转化产品→沉淀案例；输出引流路径、私信关键词、微信承接动作、社群/私域培育方式、转化入口。
10. 私域成交：成交是诊断不是硬聊（确认现状→找卡点→解释→给路径→对应产品→明确下一步）；输出诊断问题、客户分层、成交逻辑、跟进节奏、常见异议处理。
11. 交付资产化：把经验沉淀成资产（定位表/用户画像/产品说明页/选题库/私域话术/成交问答/案例库/交付 SOP/知识库/智能体）；输出交付流程、SOP 清单、案例沉淀、知识库结构、智能体方向。
12. 行动处方：只给优先级——"当前第一优先级不是【错误动作】，而是【正确动作】。接下来只做三件事：1…2…3…"，一句话结论收尾。
本路由硬约束：
- 客户知识库/客户资料/本轮上下文是正文依据，方法论只做后台推理；禁止把方法论名称、定位公式、模块解释、占位符模板原样呈现给用户。
- 每个模块都要能指导后续选题、文案、产品承接、私域成交和交付资产化，不能只给静态描述。
- 全案必须区分「已验证事实 / 推断判断 / 待补充证据」三类，缺数据写待补充，不编造。
- 天命底盘无命理资料时必须写"未提供/待补充"，不输出玄学断言。

G. 知识库驱动选题路由（选题 + 文案结构）
触发条件（满足任一即走本路由，不走 A-F）：
- 用户明确提到「基于知识库」「根据知识库做选题」「基于人设故事」「知识库选题」「选题加文案结构」「基于采访素材做选题」；
- 本轮上下文已选中较完整的客户知识库（老板经历/人设素材）且要求做选题。
固定输出结构（顺序固定）：
1. 素材锚点：从客户知识库抽取的真实素材清单——人物身份、经历、铁证标签、反差点、至暗时刻、高光时刻、原生家庭冲突、识人案例、金句原话；每条必须标注来源（知识库哪一节）。严禁编造知识库里没有的人物、数字、事件、金句。
2. 账号阶段判断：基于知识库判断当前 IP 处于哪个阶段（第一阶段立人设 / 第二阶段做矩阵 / 第三阶段做转化闭环），并据此决定内容路由配比。
3. 选题清单（约 8-12 条）：每条固定字段——① 选题一句话标题 ② 内容路由类型（人设信任型/观点立场型/问题解决型/案例转化型）③ 叙事引擎 ④ 10套结构之一 ⑤ 16套表达模板之一 ⑥ 七大开头之一 ⑦ 价值观锚点 ⑧ 知识库素材来源。
4. 文案结构（每条选题配一段）：
   - 人设信任型 → 故事弧线5拍（困难→冲突→【内心矛盾】→解决→结果），用 20/20/25/20/15 占比，必须点出内心矛盾那一拍；
   - 观点立场型/问题解决型/案例转化型 → 5A 漏斗走位（标注走到哪几步），用事件内容化5段式骨架。
5. 统一约束自检：每条只讲一个核心问题、只留一个 CTA、回归四个价值观锚点之一、守人设红线、保留原话/毛边（去AI味）。
6. 待补充：列出知识库里缺、但能提升选题质量的素材方向（供下次采访补全）。
本路由硬约束：
- 正文依据是客户知识库/本轮上下文，方法论只做后台推理；禁止把方法论名称、公式、卡片编号原样呈现给用户，只在正文最前面的 [[AIM_METHOD_NOTE]] 块里用 3-5 条说明本次调用了哪些判断标准、证据来源和取舍。
- 叙事引擎铁律：人设型必须故事弧线、不得用 5A；非人设型才可用 5A。这是本路由区别于其他路由的核心规则。
- 严禁编造知识库里没有的人物、数字、事件、金句；素材不足写「待补充」，不写漂亮但无依据的结论。
- 【禁止输出】完整可拍口播成稿（那是内容文案创作的活）；本路由只交付选题 + 文案结构骨架。

内部判断要求：定位结果必须能反向指导后续选题和文案。不只输出静态人设描述——内容策略底盘要说明后续选题和文案应围绕哪些主题、形式、钩子和发布节奏展开。所有数字都要分清"已有证据"和"建议比例/推断"，缺数据时宁可写待补充，不写漂亮但无依据的结论。

方法论呈现规则：
- 方法论只用于思考过程，最终方案必须直接给结果，不要写成"我们的方法论说明书"。
- 如果需要说明判断依据，只在正文最前面输出一个短块：
[[AIM_METHOD_NOTE]]
用 3-5 条写清本次调用了哪些判断标准、证据来源和取舍。
[[/AIM_METHOD_NOTE]]
- 该短块之外的正文必须是客户可直接使用的方案结果。

【禁止输出】短视频脚本、朋友圈文案、社群文案、拍摄交接单、公众号文章等任何营销分发内容。
请直接交付一份落地方案，语气干练、坚定、去AI味，不用加任何多余的开头废话，直接输出正文。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始信息与背景：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份详细的"IP营销策划定位方案"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

export function buildContentReviewChatPrompt(contextBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的口播、短视频脚本、公众号正文、朋友圈文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话原则：
1. 只做质检和最小修改建议，不要整篇重写，除非用户明确要求重写。
2. 优先检查：开头吸引力、逻辑顺畅、AI味/套话、文笔表达、平台风险、转化承接、流量潜力。
3. 输出必须包含：总体结论、必改问题、风险等级、流量潜力评分（0-100分）、最小修改建议、复检清单。
4. 如果发现疑似违规、绝对化、诱导私信、夸大承诺或平台敏感表达，明确标出原句和替换建议。
5. 如果用户没有提供完整文案，直接提醒用户粘贴稿子或选择最近生成稿，不要凭空质检。

请直接根据上文与用户的历史对话，输出发布前质检建议。`
}

export function buildContentReviewGeneratePrompt(knowledgeBlock: string): string {
  return `你是「发布质检官」，负责对准备发布的文案做发布前自查。

企业已有核心知识库（只作背景，不要抢走用户当前稿子的主题）：
${knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

质检报告输出结构要求：
1. 总体结论：可发 / 改完可发 / 暂不建议发，并说明一句理由。
2. 必改问题：列出最影响发布的 1-5 个问题，指出原句或段落。
3. 平台风险：检查违规、限流、绝对化、夸大承诺、诱导私信、AI标注提醒等风险。
4. 表达质量：检查开头吸引力、逻辑、去AI味、文笔，不做空泛夸奖。
5. 流量潜力评分：给 0-100 分，只看停留钩子、评论争议、收藏价值、转粉/转化承接，不做播放量预测。
6. 最小修改建议：只给局部替换和删改建议，不要整篇重写。
7. 复检清单：用 3-5 条短句告诉用户改完后再看什么。

【禁止输出】新的营销文案、完整重写稿、播放量预测、发布后数据复盘。
如果用户没有提供完整文案，提示用户粘贴稿子或选择最近生成稿。
请直接输出质检报告，不写套话、黑话和前言。`
}

// ─── 5. 发布质检官 (ContentReviewHandler) ────────────────────

class ContentReviewHandler implements AimAgentHandler {
  agentId = "content_review" as const

  /** 发布质检官仅产出 raw_copy 质检报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    return buildContentReviewChatPrompt(buildChatContextBlock(params))
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 质检报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      ContentReviewHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = buildContentReviewGeneratePrompt(context.knowledgeBlock)

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的待质检文案或质检要求：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份"发布前质检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 6. 人设故事官 (PersonaHandler) ─────────────────────

class PersonaHandler implements AimAgentHandler {
  agentId = "persona" as const

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是「人设故事官」，专门帮 IP 把自己的"来时路"一步步梳理成一条高质量的置顶视频脚本。

企业已有核心知识库（参考背景）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的工作方式（引导式，每轮只推进一个维度）：
按顺序把以下 6 个维度收集齐，每轮只追问当前最关键的 1 个缺口，并给一个降低门槛的回答示例：
1. 经历与成就：哪一年做了什么、做成/赚到过什么（要具体年份，是置顶视频的关键记忆点）
2. 低谷与转折：哪一年跌入困境、最痛的点是什么
3. 顿悟：什么契机让你想明白、悟到了什么
4. 当前产品/服务：现在具体做什么、卖什么、怎么交付
5. 目标用户与卡点：服务谁、他们最具体的困境（一句话）
6. 标志性结果/案例：一个能证明你方法有效的具体案例或客户反馈

每轮回复的硬性格式（必须严格遵守）：
- 第一行必须是进度标记，精确格式：【进度 XX%】（XX 按已收齐维度估算：6 维全齐=100%，每维约 15-20%；用户信息越具体越接近满格；只要还差一个维度就别给 100%）
- 进度标记后，先用 2-4 行简述"目前已经清楚的部分"
- 再用 1 行点明"现在最影响脚本质量的地方"
- 然后只问当前最关键的 1 个缺口，附一个回答示例（例如"你可以从『某年某月，我…』开始"），一次只问一个，不要抛多个开放问题
- 当且仅当进度到达 100%（6 维基本齐）时，停止追问，直接产出：
  ①「来时路总结」一段（150 字内）
  ②「置顶视频脚本」：逐句"口播 + 配图建议"，每句单独成行，10-18 句
- 产出脚本后，如果用户说"第 N 句改 X / 去掉 Y"，只调整对应句，然后重新给出整段脚本，其他句保持不变

风格要求：
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比和万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源

请根据上文与用户的历史对话，产出下一轮内容（必须以【进度 XX%】开头）。`
  }

  private buildIntakeReceivePrompt(): string {
    return `你是一个「前采信息整理专家」。用户会分批发送前采资料。
规则：
1. 用户发来前采文字时，只需回复"收到"。
2. 不要追问、不要分析、不要输出任何报告。
3. 等待用户发送"开始整理"的指令。
请回复"收到"。`
  }

  private buildIntakeCompilePrompt(): string {
    return `你是一个「前采信息整理专家」。请根据对话历史中的所有前采内容，输出结构化报告：

## 一、身份信息
## 二、人设特征
## 三、故事素材（3-5 个有爆点的真实故事）
## 四、商业逻辑
## 五、客户画像
## 六、内容素材（5-10 个可做选题的话题 + 金句）
## 七、信息缺口与补采建议（5-10 个具体问题）

直接输出报告，不要追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    const lastUserMsg = params.messages[params.messages.length - 1]?.content ?? ""
    const mode = detectPersonaMode(lastUserMsg)
    let prompt: string
    if (mode === "intake") {
      prompt = this.buildIntakeReceivePrompt()
    } else if (mode === "intake_compile") {
      prompt = this.buildIntakeCompilePrompt()
    } else {
      prompt = this.buildChatPrompt(params)
    }
    return executeChatLLM(this.agentId, prompt, params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是「人设故事官」。把用户提供的来时路素材，整理成一条置顶视频脚本。

【输出规则 — 严格遵循】
- 只输出两部分：「来时路总结」一段（150 字内）+「置顶视频脚本」逐句口播与配图建议
- 脚本逐句成行，每句格式为"口播：xxx ｜ 配图：xxx"，10-18 句
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比、万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源`

    const systemPrompt = `${agentPrompt}

${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户提供的来时路素材：
"${context.rawInput}"

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}请直接输出「来时路总结 + 置顶视频脚本」，不要包含任何解释性文字。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: rawText,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      raw_copy: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: [{ format: "video_script" as ContentFormat, content: rawText, wordCount: rawText.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 前采模式检测 ───────────────────────────────────────────

export function detectPersonaMode(input: string): "guided" | "intake" | "intake_compile" {
  const text = input.trim()
  if (text.includes("开始整理")) return "intake_compile"
  const intakeKeywords = ["前采", "访谈", "录音", "整理", "报告", "资料整理", "逐字稿"]
  if (intakeKeywords.some((kw) => text.includes(kw))) return "intake"
  return "guided"
}

// ─── 调度与分流器 ───────────────────────────────────────────

const HANDLERS: Record<AimAgentId, AimAgentHandler> = {
  content_producer: new ContentProducerHandler(),
  free_copywriter: new FreeCopywriterHandler(),
  deep_copywriter: new DeepCopywriterHandler(),
  business_system_diagnosis: new BusinessSystemDiagnosisHandler(),
  business_diagnosis: new BusinessDiagnosisHandler(),
  content_review: new ContentReviewHandler(),
  persona: new PersonaHandler(),
}

// VALID_AGENT_IDS / 别名映射统一引用 @/lib/aim-harness/contracts，避免与
// AimAgentId 字面量出现第三份事实源。
const VALID_AGENT_IDS = AIM_AGENT_IDS as ReadonlySet<string>
const AGENT_ID_ALIASES = LEGACY_AGENT_ID_ALIASES

export function getAgentHandler(agentId: string): AimAgentHandler {
  // 1. 直接命中
  if (VALID_AGENT_IDS.has(agentId)) {
    return HANDLERS[agentId as AimAgentId]
  }
  // 2. 尝试别名映射
  const aliased = AGENT_ID_ALIASES[agentId]
  if (aliased && VALID_AGENT_IDS.has(aliased)) {
    return HANDLERS[aliased]
  }
  // 3. 回退到默认 handler
  return HANDLERS[DEFAULT_AIM_AGENT]
}

/**
 * 统一 chat 处理入口
 */
async function buildAimChatRuntime(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): Promise<{ handler: AimAgentHandler; params: AimChatParams }> {
  const compressed = await runAimTraceStep(
    params.trace,
    "compress_messages",
    "上下文压缩",
    () => compressAimMessages(agentId, params.messages),
    (result) => ({
      summary: result.didCompress ? "已压缩长对话" : "无需压缩",
      metadata: { messageCount: params.messages.length, didCompress: result.didCompress },
    }),
  )
  const enrichedKnowledgeBlock = compressed.didCompress
    ? `【对话摘要】\n${compressed.summary}\n\n${params.knowledgeBlock}`
    : params.knowledgeBlock
  const conversationBlock = params.conversationIntent
    ? buildConversationIntentBlock(params.conversationIntent)
    : ""

  const [methodologyBlock, businessDiagnosisBlock, ipWikiBlock] = await runAimTraceStep(
    params.trace,
    "build_runtime_context",
    "方法论/IP Wiki 上下文",
    () => Promise.all([
      params.conversationIntent?.useMethodology === false ? Promise.resolve("") : buildIpCopywritingMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || agentId !== "business_system_diagnosis"
        ? Promise.resolve("")
        : buildBusinessDiagnosisMethodologyBlock(),
      params.conversationIntent?.useMethodology === false || !params.projectId
        ? Promise.resolve("")
        : buildIpWikiBlock({ projectId: params.projectId }),
    ]),
    ([methodology, businessDiagnosis, ipWiki]) => ({
      summary: "运行上下文已构建",
      metadata: {
        methodologyChars: methodology.length,
        businessDiagnosisChars: businessDiagnosis.length,
        ipWikiChars: ipWiki.length,
      },
    }),
  )
  const budgeted = applyAimContextBudget({
    conversationBlock,
    knowledgeBlock: enrichedKnowledgeBlock,
    methodologyBlock,
    businessDiagnosisBlock,
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock,
  }, params.runtimeTask ?? "rewrite_copy")
  await addAimTraceStep(params.trace, {
    key: "context_budget",
    label: "上下文预算",
    status: "success",
    summary: `${budgeted.stats.includedChars}/${budgeted.stats.budgetChars} 字`,
    metadata: budgeted.stats,
  })

  return {
    handler: getAgentHandler(agentId),
    params: {
      ...params,
      conversationBlock: budgeted.blocks.conversationBlock,
      knowledgeBlock: budgeted.blocks.knowledgeBlock,
      methodologyBlock: budgeted.blocks.methodologyBlock,
      businessDiagnosisBlock: budgeted.blocks.businessDiagnosisBlock,
      ipWikiBlock: budgeted.blocks.ipWikiBlock,
    },
  }
}

export async function buildAimChatResponse(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">,
): Promise<AimChatResponse> {
  const runtime = await buildAimChatRuntime(agentId, params)
  return runAimTraceStep(
    params.trace,
    "llm_chat",
    "LLM 聊天生成",
    () => runtime.handler.chat(runtime.params),
    (result) => ({ outputSummary: summarizeText(result.content) }),
  )
}

export async function* buildAimChatResponseStream(
  agentId: string,
  params: Omit<AimChatParams, "conversationBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "ipWikiBlock">
): AsyncIterable<string> {
  const runtime = await buildAimChatRuntime(agentId, params)
  yield* runtime.handler.streamChat(runtime.params)
}

/**
 * 统一 generate 处理入口
 */
export async function buildAimGeneration(agentId: string, params: Omit<AimGenerateContext, "agentId" | "knowledgeBlock" | "methodologyBlock" | "businessDiagnosisBlock" | "viralStructureBlock" | "eventStorytellingBlock" | "ipWikiBlock" | "retrievedEntries" | "retrievedSource" | "knowledgeStrategy">): Promise<AimGenerateResponse> {
  const handler = getAgentHandler(agentId)

  // ── 阶段 2.3：装配下沉到 prepareAimContext（统一上下文装配阶段）──
  // 此前的 step1-4（项目校验 / runtimeTask·生成意图·知识策略解析 / Promise.all
  // 背景 block 加载 / TaskSpec 构建 / 压缩 / 上下文预算）已集中到 prepareAimContext，
  // 与原实现逐字等价。buildAimGeneration 现在只做：装配 → handler.generate → 收尾。
  const plannedSpec = planAimRun({
    entrypoint: "generate",
    agentId: agentId as AimAgentId,
    rawInput: params.rawInput,
    targetFormats: params.targetFormats,
    taskType: params.taskType,
    polishInstruction: params.polishInstruction,
    topicType: params.topicType,
    hotTopic: params.hotTopic,
    actorId: params.userId,
    projectId: params.projectId,
  })
  // route 可能已解析 runtimeTask（与 planner 同源函数，结果应一致）；若有差异，
  // 采用 route 值以保持向后兼容（原 buildAimGeneration 行为：params.runtimeTask 优先）。
  const spec = params.runSpec ?? (params.runtimeTask
    ? { ...plannedSpec, runtimeTask: params.runtimeTask }
    : plannedSpec)

  const prepared = await prepareAimContext({
    spec,
    userId: params.userId,
    trace: params.trace,
    taskType: params.taskType,
    polishInstruction: params.polishInstruction,
    taskSpec: params.taskSpec,
    topicSelectionId: params.topicSelectionId,
    topicTitle: params.topicTitle,
    topicRationale: params.topicRationale,
    topicType: params.topicType,
    hotTopic: params.hotTopic,
    videoCopyExtractionId: params.videoCopyExtractionId,
    contentScenario: params.contentScenario,
    contextOverride: params.contextOverride,
  })

  const runtimeTask = prepared.spec.runtimeTask
  const knowledgeStrategy = prepared.spec.knowledgeStrategy
  // 生成意图 mode（供响应回传；与原 buildAimGeneration 末尾的 conversationMode 一致）
  const generationMode = resolveAimConversationIntentWithRules({
    agentId,
    messages: [{ role: "user", content: [params.rawInput, params.polishInstruction].filter(Boolean).join("\n") }],
  }).intent.mode

  // 5. 调用具体的智能体 Handler（接收已装配的 prepared blocks）
  const response = await runAimTraceStep(params.trace, "agent_generate", "智能体生成并保存", () => handler.generate({
    ...params,
    agentId,
    runtimeTask,
    modelPolicy: prepared.spec.modelPolicy,
    knowledgeBlock: prepared.blocks.knowledge,
    methodologyBlock: prepared.blocks.methodology,
    businessDiagnosisBlock: prepared.blocks.businessDiagnosis,
    viralStructureBlock: prepared.blocks.viralStructure,
    eventStorytellingBlock: prepared.blocks.eventStorytelling,
    ipWikiBlock: prepared.blocks.ipWiki,
    retrievedEntries: (prepared.retrievedEntries ?? []) as any[],
    retrievedSource: prepared.retrievedSource ?? "raw",
    knowledgeStrategy,
    taskSpec: prepared.taskSpec,
  }), (result) => ({
    summary: `生成 ${result.results.length} 个交付物`,
    outputSummary: summarizeText(result.results.map((item) => `${item.format}: ${item.content}`).join("\n")),
    metadata: { resultId: result.id, formats: result.results.map((item) => item.format) },
  }))

  // 6. 后续处理 (Fire-and-forget 向量写入)
  if (!params.skipPersistence) {
    await addAimTraceStep(params.trace, {
      key: "fire_knowledge_embedding",
      label: "知识向量补写",
      status: "success",
      summary: "已触发后台补写",
      metadata: { entries: (prepared.retrievedEntries ?? []).length },
    })
    fireKnowledgeEmbedding((prepared.retrievedEntries ?? []) as any[], prepared.retrievedSource ?? "raw")
  }

  const saved = params.skipPersistence
    ? null
    : await getAimGenerationUsage(response.id)
  await finishAimTrace(params.trace, {
    aimGenerationId: response.id,
    model: saved?.model || null,
    totalTokens: saved?.totalTokens || null,
    outputSummary: summarizeText(response.results.map((item) => item.content).join("\n\n")),
  })

  return { ...response, conversationMode: generationMode, knowledgeStrategy, taskSpec: prepared.taskSpec }
}

// ─── 共享辅助函数 ───────────────────────────────────────────
