import { LLMClient } from "@/lib/llm/client"
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import { callLLMJsonWithRetry } from "@/lib/aim/llm-json-retry"
import type { ExtractedSegment, ExtractedStructure } from "@/lib/aim/script-structure-extractor"

// ─── 类型定义 ──────────────────────────────────────────────

export interface GenerateScriptsInput {
  /** 已提取的结构模板 */
  structure: ExtractedStructure
  /** 生成数量，1-10 */
  count: number
  /** 用于检索知识库的用户 ID */
  userId: string
  /** 项目 ID（知识库作用域） */
  projectId: string
  /** 智能体 ID，默认 content_producer */
  agentId?: string
  /** 可选的主题/选题标题，用于引导生成方向 */
  topicTitle?: string
}

/** 单条生成文案。 */
export interface GeneratedScript {
  /** 完整文案正文 */
  content: string
  /** 一句话标题（模型自拟） */
  title: string
  /** 使用的结构片段顺序（用于校验结构一致性） */
  segmentOrder: string[]
}

export interface GenerateScriptsResult {
  scripts: GeneratedScript[]
  /** 注入的知识库摘要（调试/透明度用） */
  knowledgeSummary: string
  /** 模型名 */
  model: string
}

// ─── 常量 ──────────────────────────────────────────────────

const MIN_COUNT = 1
const MAX_COUNT = 10
const MAX_SCRIPT_CHARS = 2000

const SEGMENT_LABELS: Record<ExtractedSegment["type"], string> = {
  opening_hook: "开头钩子",
  core_content: "核心内容",
  product_intro: "产品介绍",
  cta: "行动号召",
  evidence: "证据/案例",
  transition: "过渡",
  emotion: "情感共鸣",
  value_prop: "价值主张",
  objection_handling: "异议处理",
  other: "其他",
}

// ─── 工具函数 ──────────────────────────────────────────────

export function clampCount(count: number): number {
  if (!Number.isFinite(count)) return MIN_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, Math.floor(count)))
}

/** 把结构模板渲染成 prompt 可读的骨架描述。 */
function renderStructureSkeleton(s: ExtractedStructure): string {
  const lines = s.segments.map((seg) => {
    const typeLabel = SEGMENT_LABELS[seg.type] ?? seg.type
    return [
      `${seg.order}. 【${typeLabel}】${seg.label}`,
      `   写作指令：${seg.instruction}`,
      seg.example ? `   参考例句：${seg.example}` : "",
    ].filter(Boolean).join("\n")
  })
  return [
    `结构名：${s.displayName}`,
    s.description ? `适用场景：${s.description}` : "",
    `开头模式：${s.openingPattern}`,
    `节奏：${s.pace}｜证据密度：${s.evidenceDensity}｜CTA 风格：${s.ctaStyle}`,
    "",
    "结构骨架（按此顺序逐段写）：",
    ...lines,
  ].filter(Boolean).join("\n")
}

// ─── Prompt 构建 ───────────────────────────────────────────

function buildGenerationSystemPrompt(structure: ExtractedStructure): string {
  return [
    "你是一名短视频文案创作专家。请严格按照给定的结构骨架，结合知识库中的 IP 人设、产品卖点、品牌调性，",
    `一次生成指定数量的原创视频文案。每条文案必须遵循结构骨架的片段顺序，但内容要基于知识库信息做差异化，`,
    "不能照抄参考例句。",
    "",
    "=== 结构骨架 ===",
    renderStructureSkeleton(structure),
    "",
    "生成要求：",
    "1. 严格按结构骨架的片段顺序组织每条文案，不要增删片段、不要调换顺序；",
    "2. 每条文案的内容必须融合知识库中的真实信息（IP 经历、产品卖点、客户痛点、案例），不要编造未提供的数据；",
    "3. 多条文案之间要有差异化：切入点、案例选取、表达角度都要不同，避免雷同；",
    "4. 保持原文案的表达风格（口语化、可拍摄口播），不要写成书面报告；",
    "5. 每条文案篇幅服从用户指令；用户没提字数时按结构骨架与知识库信息自然展开，不设固定字数区间；",
    "",
    "输出要求：严格输出 JSON，不要输出任何额外文字。JSON 结构：",
    '{',
    '  "scripts": [',
    '    {',
    '      "title": "文案标题(≤20字)",',
    '      "content": "完整文案正文",',
    '      "segmentOrder": ["开头钩子", "核心内容", "产品介绍", "行动号召"]',
    '    }',
    '  ]',
    '}',
  ].join("\n")
}

function buildGenerationUserPrompt(
  count: number,
  knowledgeBlock: string,
  topicTitle?: string,
): string {
  return [
    `请生成 ${count} 条原创视频文案。`,
    "",
    topicTitle ? `本次选题方向：${topicTitle}` : "",
    "",
    "=== 企业知识库（生成时必须参考，只能用真实信息，不要编造） ===",
    knowledgeBlock || "（未检索到相关知识库内容，请按结构骨架自由生成合理内容）",
    "",
    "请基于上述知识库信息和结构骨架，生成有差异化、结构一致的原创文案。",
  ].filter(Boolean).join("\n")
}

// ─── 结果校验 ──────────────────────────────────────────────

function coerceGeneratedScript(raw: unknown): GeneratedScript | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const content = typeof r.content === "string" ? r.content.slice(0, 4000) : ""
  if (!content) return null
  const title = typeof r.title === "string" ? r.title.slice(0, 40) : ""
  const segmentOrder = Array.isArray(r.segmentOrder)
    ? (r.segmentOrder as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20)
    : []
  return { content, title, segmentOrder }
}

export function coerceGeneratedScripts(raw: unknown, expectedCount: number): GeneratedScript[] {
  if (!raw || typeof raw !== "object") return []
  const r = raw as Record<string, unknown>
  const arr = Array.isArray(r.scripts) ? r.scripts : []
  const scripts = arr
    .map((item) => coerceGeneratedScript(item))
    .filter((s): s is GeneratedScript => s !== null)
  if (scripts.length === 0) return []
  // 截断到期望数量（模型可能多生成）
  return scripts.slice(0, expectedCount)
}

// ─── 对外入口 ──────────────────────────────────────────────

/** 基于结构模板 + 知识库批量生成文案。
 *  - 通过 buildAimKnowledgeContext 检索 IP 人设/产品卖点/品牌调性等知识；
 *  - 单次 LLM 调用生成 count 条，避免多次往返；
 *  - LLM 失败时抛错，由调用方决定降级策略。 */
export async function generateScriptsFromStructure(
  input: GenerateScriptsInput,
): Promise<GenerateScriptsResult> {
  const count = clampCount(input.count)
  const agentId = input.agentId ?? "content_producer"

  // 1. 检索知识库（IP 人设、产品卖点、品牌调性等）
  const knowledgeContext = await buildAimKnowledgeContext({
    userId: input.userId,
    projectId: input.projectId,
    agentId,
    query: input.topicTitle
      ? `${input.topicTitle} ${input.structure.displayName}`
      : input.structure.displayName,
    topicTitle: input.topicTitle,
  })

  // 2. 调用 LLM 生成（JSON 解析失败时自动重试一次）
  const llm = LLMClient.shared()
  const { data, model } = await callLLMJsonWithRetry(
    llm,
    {
      system: buildGenerationSystemPrompt(input.structure),
      user: buildGenerationUserPrompt(count, knowledgeContext.knowledgeBlock, input.topicTitle),
      temperature: 0.8,
      maxTokens: 4000 + count * 1500,
    },
    "文案生成结果解析失败",
  )

  const scripts = coerceGeneratedScripts(data, count)
  if (scripts.length === 0) {
    throw new Error("文案生成结果为空，模型未返回有效文案")
  }

  return {
    scripts,
    knowledgeSummary: knowledgeContext.knowledgeBlock.slice(0, 500),
    model,
  }
}

/** 校验单条生成文案长度。 */
export function validateGeneratedScript(script: GeneratedScript): string | null {
  if (!script.content) return "文案内容为空"
  if (script.content.length < 50) return "文案内容过短（少于 50 字）"
  if (script.content.length > MAX_SCRIPT_CHARS * 2) return "文案内容过长"
  return null
}
