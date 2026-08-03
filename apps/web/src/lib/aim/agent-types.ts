/**
 * AIM Agent 类型契约（阶段 3.1 从 aim-agent-handlers.ts 抽出）。
 *
 * 集中定义智能体接口与上下文/响应类型，作为 agents/ 各模块与编排层的共享类型源。
 * 此前这些类型内联在 1649 行的 aim-agent-handlers.ts 中；抽出后各 agent 模块可直接
 * import，不必反向依赖编排层。
 *
 * 纯类型，无运行时逻辑。
 */

import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import type {
  AimConversationIntent,
  AimConversationMode,
} from "@/lib/aim-conversation-intent"
import type {
  AimRuntimeTask,
  ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import type { AimModelPolicy } from "@/lib/aim-harness/types"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type { ContentScenario } from "@/lib/content-scenario-config"
import type { TaskSpec } from "@/lib/task-spec"
import type { AimRunSpec } from "@/lib/aim-harness/types"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

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
  /** ADR-002：本次指定命名方法论（chat 装配层注入，未选择时为空串） */
  selectedMethodologyBlock?: string
  conversationIntent?: AimConversationIntent
  runtimeTask?: AimRuntimeTask
  /** 任务单（chat 路径注入，供提示词绑定档案与运营字段） */
  taskSpec?: TaskSpec
  /** IP 方法论动态选卡计划 */
  methodologyPlan?: import("@/lib/methodology/resolve-copy-methodology-plan").CopyMethodologyPlan
  /** 解析后的知识策略（可选，驱动任务感知知识规则） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  modelPolicy?: AimModelPolicy
  trace?: AimTraceRecorder
  /** 已格式化的单条发布结果文本块；缺失时提示词走「未登记发布数据」分支 */
  publishOutcomeBlock?: string
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
  taskSpec?: TaskSpec
  runtimeTask?: AimRuntimeTask
  modelPolicy?: AimModelPolicy
  runSpec?: AimRunSpec

  // 共享数据上下文
  knowledgeBlock: string
  methodologyBlock: string
  businessDiagnosisBlock: string
  viralStructureBlock: string
  /** 事件内容化方法论（现场/事件复盘类专用，非该类内容时为空串） */
  eventStorytellingBlock: string
  /** IP 定位维基（已编译定位底盘），无 projectId 或无维基页时为空串 */
  ipWikiBlock: string
  /** ADR-002：本次指定命名方法论（独立预算块，未选择时为空串） */
  selectedMethodologyBlock: string
  retrievedEntries: any[]
  retrievedSource: string
  /** 本次实际生效的知识调用策略（解析后回传，供 UI 反馈） */
  knowledgeStrategy: ResolvedKnowledgeStrategy
  /** 内容场景模式（由前端或路由层传入，驱动提示块和知识策略差异化） */
  contentScenario?: ContentScenario
  /** IP 方法论动态选卡计划（intent → cards → structureModules） */
  methodologyPlan?: import("@/lib/methodology/resolve-copy-methodology-plan").CopyMethodologyPlan
  trace?: AimTraceRecorder
  /** Eval-only: use frozen context instead of live DB loaders. */
  contextOverride?: AimGenerationContextOverride
  /** Eval-only: execute the production prompt/model path without writing history. */
  skipPersistence?: boolean
  /** 用户确认的本轮意图（生成前确认条；有则优先写入 prompt） */
  confirmedTurnIntent?: import("@/lib/aim-turn-intent").AimTurnIntent
  /** 发布质检官模式 */
  reviewMode?: import("@/features/newsroom/contracts").ContentReviewMode
  /** 已格式化的单条发布结果文本块；缺失时提示词走「未登记发布数据」分支 */
  publishOutcomeBlock?: string
  /** IP 操盘案六页核心结构化数据（用于合规校验）；无 projectId 或无维基页时 undefined */
  ipWikiPages?: Partial<
    Record<
      import("@/lib/ip-wiki/types").IpWikiPageType,
      import("@/lib/ip-wiki/repo").IpWikiPageRow
    >
  >
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
  /** Eval-only：冻结写作风格档案；缺省则 generate 不注入风格 */
  styleProfileBlock?: string
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
    categoryLabel?: string
    snippet?: string
  }>
  conversationMode?: AimConversationMode
  /** 本次实际生效的知识调用策略（由 buildAimGeneration 解析后注入，供 UI 反馈） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  /** 协作认知层产物：风险/模式/事实/缺口/假设（由 buildAimGeneration 注入） */
  taskSpec?: TaskSpec
  /** 工作流状态（生成落库后回填，供状态下拉使用真实当前态） */
  workflowStatus?: string
  projectId?: string | null
}

export interface AimAgentHandler {
  agentId: AimAgentId
  chat(params: AimChatParams): Promise<AimChatResponse>
  streamChat(params: AimChatParams): AsyncIterable<string>
  generate(context: AimGenerateContext): Promise<AimGenerateResponse>
}
