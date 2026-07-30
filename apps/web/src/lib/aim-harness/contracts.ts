/**
 * AIM Harness — 唯一共享契约（single source of truth）。
 *
 * 这个文件是 AIM 运行时的身份契约唯一源：智能体 id、入口名，以及与 id
 * 同源的运行时校验/归一化逻辑。此前这些定义被散落在 handler、ui-config、
 * harness/types、eval/contracts 四处各自重复声明，靠"字面量相同 + as 强转"
 * 维系一致；现在收敛到这里，所有模块一律 import 本文件。
 *
 * 纯逻辑，无 React / 图标 / 数据库依赖。UI 元数据（标题、图标、默认格式）
 * 仍在 aim-ui-config.ts 维护，只把这里的类型作为 id 的事实源。
 */

import type { CopyStudioModule } from "@/lib/copy-studio"

/** AIM 七个内容智能体的规范 id（唯一事实源） */
export type AimAgentId =
  | "content_producer"
  | "free_copywriter"
  | "work_editor"
  | "business_system_diagnosis"
  | "business_diagnosis"
  | "content_review"
  | "content_retro"
  | "persona"

/** 四个服务端入口（镜像 AimRunSpec.entrypoint） */
export type AimEntrypoint = "chat" | "generate" | "agent_api" | "inspiration"

/**
 * 与 AimAgentId 字面量同源的合法 id 集合。作为 isValidAimAgent 的运行时依据，
 * 避免"类型字面量"与"运行时校验集合"出现第三份重复源。
 */
export const AIM_AGENT_IDS: ReadonlySet<AimAgentId> = new Set<AimAgentId>([
  "content_producer",
  "free_copywriter",
  "work_editor",
  "business_system_diagnosis",
  "business_diagnosis",
  "content_review",
  "content_retro",
  "persona",
])

/** 默认智能体（回退值） */
export const DEFAULT_AIM_AGENT: AimAgentId = "content_producer"

/**
 * 旧 id 归一化映射。
 * - 内容生产官曾用 "ip_video"，现统一为 "content_producer"
 * - 作品编辑曾用 "deep_copywriter"，现统一为 "work_editor"
 * 保留旧 id 的归一化，使旧书签链接、旧外部调用、旧数据库行都能正确路由，不报 404。
 */
export const LEGACY_AGENT_ID_ALIASES: Record<string, AimAgentId> = {
  ip_video: "content_producer",
  deep_copywriter: "work_editor",
}

/**
 * 把旧别名归一化为当前规范 id。
 * - 空值回退默认智能体；
 * - 命中别名返回映射后的规范 id；
 * - 否则原样返回（是否最终合法由 isValidAimAgent 判定）。
 *
 * 返回 string 而非 AimAgentId：调用方可能传入完全未知的外部 id，归一化阶段
 * 不做合法性断言，留待 isValidAimAgent / getAgentHandler 决定回退策略。
 */
/**
 * @description 标准化aimagentid
 * @param id - 唯一标识符
 * @returns string
 */
export function normalizeAimAgentId(id: string | null | undefined): string {
  if (!id) return DEFAULT_AIM_AGENT
  return LEGACY_AGENT_ID_ALIASES[id] ?? id
}

/** 判断某个 id 是否是合法的智能体 id（接受旧别名） */
/**
 * @description 判断是否validaimagent
 * @param id - 唯一标识符
 * @returns id is AimAgentId
 */
export function isValidAimAgent(id: string | null | undefined): id is AimAgentId {
  if (!id) return false
  return (AIM_AGENT_IDS as Set<string>).has(id) || id in LEGACY_AGENT_ID_ALIASES
}

// ─── v2 运行时契约（升级阶段 1.2 引入，阶段 1.3 起 executeAimRun/streamAimRun 消费）
// ────────────────────────────────────────────────────────────────────────────
//
// 下面四个类型是"Harness 作为唯一执行内核"的对外契约形状。它们复用已有的
// AimRunSpec / AimRunMetadata（types.ts）和 eval 侧的 FrozenContext /
// EvalExecutionResult，确保生产运行时与确定性评测共享同一套结构，可逐字对拍。
//
// 阶段 1.2 仅声明类型与 re-export，不新增任何执行逻辑（行为零变化）。阶段 2
// 的 prepareAimContext / executeAimRun / streamAimRun 才真正产出这些值。

import type { ContentFormat, AimTaskType } from "@/lib/aim-generator"
import type {
  AimRuntimeTask,
  ResolvedKnowledgeStrategy,
} from "@/lib/aim-knowledge-strategy"
import type { AimConversationMode } from "@/lib/aim-conversation-intent"
import type { TaskSpec } from "@/lib/task-spec"
import type { ContentScenario } from "@/lib/content-scenario-config"
import type {
  AimRunSpec,
  AimRunMetadata,
  AimContextSource,
  AimModelPolicyOverride,
  AimMethodologyPolicy,
  AimExecutionMode,
  AimExecutionPolicy,
} from "./types"

/**
 * 单条对话消息（chat / revision 场景）。与 EvalInput.messages 同构。
 * 单独定义以避免 v2 契约反向依赖 eval 模块。
 */
export interface AimChatTurn {
  role: "user" | "assistant"
  content: string
}

/**
 * 唯一运行请求 —— 所有 AIM 入口（generate / chat / agent_api / inspiration）
 * 在阶段 2 迁移后都必须构造它并交给 executeAimRun / streamAimRun。
 *
 * 字段是对四入口现有入参的并集；可选字段仅在对应入口有意义。agentId 为 string
 * （可能含旧别名），归一化在 executeAimRun 内部完成（阶段 2）。
 */
export interface AimRunRequest {
  /** 服务端入口 */
  entrypoint: AimEntrypoint
  /** 智能体 id（string，接受旧别名，内部归一化） */
  agentId: string
  /** 用户原始输入（已含被注入的爆款/热榜/评论等来源文本，阶段 2 由 prepareAimContext 产出） */
  rawInput: string
  agentModule?: CopyStudioModule
  writerModule?: CopyStudioModule
  /** 期望输出格式 */
  targetFormats?: ContentFormat[]
  /** 任务类型（驱动 runtimeTask 解析） */
  taskType?: AimTaskType
  /** 执行者稳定标识（userId / api key id），用于隔离与诊断 */
  actorId?: string
  projectId?: string
  /** 选题流转标识（落 AimGeneration.topicSelectionId） */
  topicSelectionId?: string
  selectedTopicIndex?: number
  /** 已授权重建的工作流 TaskSpec（route 层 buildWorkflowBrief 产出） */
  taskSpec?: TaskSpec
  /** 运行时任务覆盖（route 已解析时透传，避免 planner 二次解析） */
  runtimeTask?: AimRuntimeTask
  /** 知识策略覆盖（已解析时透传） */
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  conversationMode?: AimConversationMode
  /** chat / revision 场景的对话历史 */
  messages?: AimChatTurn[]
  /** 输出格式相关元数据 */
  topicTitle?: string
  topicRationale?: string
  topicType?: string
  hotTopic?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  contentScenario?: ContentScenario
  /** 复用既有生成记录（追改场景） */
  existingGenerationId?: string
  /** 关联 trace（route 层已创建） */
  trace?: { id: string }
  /** 入口已装配的声明式上下文（过渡期；最终由 prepareAimContext 统一产出） */
  contextManifest?: AimContextSource[]
  /** draft-only：不落生成记录（agent_api 外部交付） */
  draftOnly?: boolean
  /** 是否跑 LLM 质检（默认 true；agent_api / inspiration 关闭） */
  runLlmQuality?: boolean
  /** Eval/测试可关闭快照与 trace 回标；生产默认开启 */
  persistSnapshot?: boolean
  /** 流式输出 */
  stream?: boolean
  /** 受约束的单次模型策略覆盖；由 planner 校验并冻结。 */
  modelPolicy?: AimModelPolicyOverride
  /** ADR-002：显式选择的命名方法论 profile id（MVP 最多 1 个）。 */
  methodologyProfileIds?: string[]
  /**
   * 高稳 LLM 任务路由开关。默认关闭；设 AIM_STABLE_ROUTING=1 或显式 true 后启用。
   * 等有用户使用经验再开。当前优先规则意图 + 本轮意图契约。
   */
  stableRouting?: boolean
  /**
   * 用户已确认本轮意图：runtimeTask 已由确认 action 映射，禁止再次向量/LLM 路由。
   */
  intentFrozen?: boolean
  /** Harness 执行模式；默认 single_shot。bounded_tool_loop 须命中白名单。 */
  executionMode?: AimExecutionMode
  /** 完整执行策略；未传则按 single_shot 冻结默认值。 */
  executionPolicy?: Partial<AimExecutionPolicy>
}

/**
 * 统一上下文装配阶段的产物。prepareAimContext(spec) 一次产出 prompt 所需的全部
 * block + 声明式来源清单，handler 只读它、不再自行查知识/建 TaskSpec。
 *
 * 与 eval 侧 FrozenContext 同构（blocks 字段一一对应），保证生产与评测可对拍。
 */
export interface PreparedAimContext {
  /** 冻结的运行计划（planner 产出，不可变） */
  spec: AimRunSpec
  /** 进 prompt 的最终用户输入文本（逐字，含注入来源） */
  rawInput: string
  /** 各类上下文 block；空 block 为 ""，便于直接拼接 */
  blocks: {
    knowledge: string
    methodology: string
    businessDiagnosis: string
    viralStructure: string
    eventStorytelling: string
    ipWiki: string
    /** ADR-002：本次指定命名方法论（独立预算块）。 */
    selectedMethodology: string
    /** 对话记忆（generate 路径此前未接入，阶段 2 接入） */
    memory?: string
    /** chat 场景的对话上下文块 */
    conversation?: string
    /** 竞品监控（chat 专有） */
    competitorWatch?: string
  }
  /** 已解析/重建的 TaskSpec（落 AimGeneration.taskSpec） */
  taskSpec?: TaskSpec
  /** IP 方法论动态选卡计划（与 taskSpec.methodologyPlan 同步） */
  methodologyPlan?: import("@/lib/methodology/resolve-copy-methodology-plan").CopyMethodologyPlan
  /** RAG 命中的知识条目（含 id，用于引用校验与 manifest） */
  retrievedEntries?: Array<{ id: string; title: string; category?: string }>
  retrievedSource?: string
  /** 声明式来源清单（每个被装配件同步 push 一条），用于 contextHash + 快照 */
  contextManifest: AimContextSource[]
  /** 是否已应用上下文预算裁剪 */
  budgetApplied: boolean
}

/**
 * 智能体产出。handler(prepared) 返回它；与 EvalExecutionResult（drafts /
 * citedKnowledgeIds / warnedInsufficientInfo）同构，便于评测 graders 复用。
 */
export interface AimAgentOutput {
  /** 每种格式的草稿 */
  drafts: Array<{ format: ContentFormat; content: string; wordCount?: number }>
  /** 实际引用的知识条目 id（用于引用校验） */
  citedKnowledgeIds?: string[]
  /** 信息不足时是否给出明确提示（而非编造） */
  warnedInsufficientInfo?: boolean
  /** 质检报告（content_review 等场景产出） */
  reviewReport?: string
}

/**
 * 唯一执行内核的返回值。executeAimRun 返回它；入口据此序列化 HTTP 响应。
 * metadata.runId 是对外执行编号（兼容现有 runId 诊断字段）。
 */
export interface AimRunResult<TOutput = AimAgentOutput> {
  /** 运行元数据（runId / provider / model / fallbackIndex / degraded / hashes） */
  metadata: AimRunMetadata
  /** 智能体产出 */
  output: TOutput
  /** 落库的生成记录 id（draftOnly 时为 undefined） */
  generationId?: string
  /** 快照 id（admin 可查） */
  snapshotId?: string
  /** 关联 trace id */
  traceId?: string
  /** 主稿 LLM 质检报告（runLlmQuality 关闭时为 undefined） */
  qualityReport?: Record<string, unknown>
  /** 每个输出格式的确定性校验 */
  qualityChecks?: import("./validators").FormatValidationResult[]
  /** 本次运行的综合质量状态 */
  qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  /** 冻结的运行计划（回传给入口做响应序列化） */
  spec: AimRunSpec
}

export type { AimRunSpec, AimRunMetadata, AimContextSource, AimMethodologyPolicy }
