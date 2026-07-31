import { LLMClient } from "@/lib/llm/client"
import { callLLMJsonWithRetry } from "@/lib/aim/llm-json-retry"

// 浏览器安全的类型与纯函数已拆到 types 文件；
// 这里 re-export 以保持服务端消费方（route/store/generator）import 路径不变。
// 客户端组件必须直接从 types 文件导入，避免经本文件拖入 undici。
export {
  type ExtractedSegment,
  type ExtractedStructure,
  type ScriptAnalysis,
  type BatchExtractionResult,
  SCRIPT_DELIMITER,
  splitScripts,
  structureToBlueprint,
} from "@/lib/aim/script-structure-extractor-types"
import {
  type ExtractedSegment,
  type ExtractedStructure,
  type ScriptAnalysis,
  type BatchExtractionResult,
  SCRIPT_DELIMITER,
} from "@/lib/aim/script-structure-extractor-types"

// ─── 常量 ──────────────────────────────────────────────────

const MAX_SCRIPTS_PER_CALL = 5
const MAX_SCRIPT_CHARS = 1500
const MAX_TOTAL_CHARS = 6000

/** 用户单次请求允许的最大对标文案条数（入口硬上限，超出直接拒绝）。 */
export const MAX_BATCH_INPUT = 10

// ─── 文本预处理（内部工具，仅服务端用）────────────────────

/** 截断单条文案，避免单条过长撑爆上下文。 */
function truncateScript(script: string): string {
  if (script.length <= MAX_SCRIPT_CHARS) return script
  return `${script.slice(0, MAX_SCRIPT_CHARS)}…`
}

/** 把多条文案打包成 LLM 输入文本，控制总字数。 */
function formatScriptsForLLM(scripts: string[]): string {
  const parts: string[] = []
  let total = 0
  for (let i = 0; i < scripts.length && i < MAX_SCRIPTS_PER_CALL; i++) {
    const truncated = truncateScript(scripts[i])
    total += truncated.length
    if (total > MAX_TOTAL_CHARS) break
    parts.push(`【文案 ${i + 1}】\n${truncated}`)
  }
  return parts.join(SCRIPT_DELIMITER)
}

// ─── Prompt 构建 ───────────────────────────────────────────

function buildExtractionSystemPrompt(): string {
  return [
    "你是一名短视频文案结构拆解专家。你的任务是：",
    "1. 逐条分析用户给出的视频文案，识别每条文案的组成片段（开头钩子、核心内容、产品介绍、行动号召等）及其排列顺序；",
    "2. 在逐条拆解基础上，提炼出一个通用的、可复用的结构模板，覆盖这批文案的共性骨架。",
    "",
    "片段类型（type 字段只能取以下值之一）：",
    "- opening_hook：开头引入/钩子（抓停、设悬念、点痛点）",
    "- core_content：核心内容段（主体论述/叙事）",
    "- product_intro：产品/服务介绍",
    "- cta：行动号召（评论/私信/关注/购买/预约）",
    "- evidence：案例/数据/证据",
    "- transition：过渡/承上启下",
    "- emotion：情感共鸣/价值观",
    "- value_prop：价值主张/差异化定位",
    "- objection_handling：异议处理/打消顾虑",
    "- other：其他",
    "",
    "输出要求：严格输出 JSON，不要输出任何额外文字。JSON 结构如下：",
    '{',
    '  "analyses": [',
    '    {',
    '      "preview": "原文前200字",',
    '      "segments": [',
    '        { "type": "opening_hook", "label": "片段名", "instruction": "写作指令", "example": "原文摘录", "order": 1 }',
    '      ]',
    '    }',
    '  ],',
    '  "structure": {',
    '    "name": "结构名(≤16字,英文短横线连接)",',
    '    "displayName": "中文展示名",',
    '    "description": "适用场景一句话",',
    '    "segments": [ { "type": "...", "label": "...", "instruction": "...", "example": "...", "order": 1 } ],',
    '    "openingPattern": "开头模式摘要",',
    '    "narrativeBeats": ["节拍1", "节拍2"],',
    '    "evidenceSlots": 1,',
    '    "ctaSlot": "CTA摘要",',
    '    "durationRange": { "min": 30, "max": 90 },',
    '    "pace": "fast|medium|slow",',
    '    "evidenceDensity": "light|medium|dense",',
    '    "ctaStyle": "consult|save|buy|follow|comment"',
    '  }',
    '}',
    "",
    "提炼结构模板时：",
    "- 结构模板的 segments 必须是这批文案共性的骨架，不是某一条的复刻；",
    "- instruction 字段要写成可执行的写作指令（下次按这个指令填新内容），不要写成对原文的描述；",
    "- example 字段从原文摘录代表性句子（≤120 字），不要改写；",
    "- order 从 1 开始连续递增；",
    "- 通用性优先：模板要能适配同赛道不同主题的新文案。",
  ].join("\n")
}

function buildExtractionUserPrompt(scripts: string[]): string {
  return [
    "请拆解以下视频文案，并提炼通用结构模板：",
    "",
    formatScriptsForLLM(scripts),
  ].join("\n")
}

// ─── 结果校验 ──────────────────────────────────────────────

const VALID_SEGMENT_TYPES = new Set<ExtractedSegment["type"]>([
  "opening_hook", "core_content", "product_intro", "cta",
  "evidence", "transition", "emotion", "value_prop",
  "objection_handling", "other",
])

function coerceSegment(raw: unknown, fallbackOrder: number): ExtractedSegment | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const type = (r.type as string) in VALID_SEGMENT_TYPES
    ? (r.type as ExtractedSegment["type"])
    : "other"
  const label = typeof r.label === "string" ? r.label.slice(0, 40) : "未命名片段"
  const instruction = typeof r.instruction === "string" ? r.instruction.slice(0, 300) : ""
  const example = typeof r.example === "string" ? r.example.slice(0, 200) : ""
  const order = Number.isFinite(r.order) ? Number(r.order) : fallbackOrder
  return { type, label, instruction, example, order }
}

function coerceStructure(raw: unknown): ExtractedStructure | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const segmentsRaw = Array.isArray(r.segments) ? r.segments : []
  const segments = segmentsRaw
    .map((s, i) => coerceSegment(s, i + 1))
    .filter((s): s is ExtractedSegment => s !== null)
  if (segments.length === 0) return null
  return {
    name: typeof r.name === "string" ? r.name.slice(0, 64) : "extracted_structure",
    displayName: typeof r.displayName === "string" ? r.displayName.slice(0, 40) : "提取结构",
    description: typeof r.description === "string" ? r.description.slice(0, 200) : "",
    segments,
    openingPattern: typeof r.openingPattern === "string" ? r.openingPattern.slice(0, 200) : segments[0].label,
    narrativeBeats: Array.isArray(r.narrativeBeats)
      ? (r.narrativeBeats as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10)
      : segments.slice(1, -1).map((s) => s.label),
    evidenceSlots: Number.isFinite(r.evidenceSlots) ? Number(r.evidenceSlots) : 0,
    ctaSlot: typeof r.ctaSlot === "string" ? r.ctaSlot.slice(0, 200) : segments[segments.length - 1].label,
    durationRange: {
      min: 30,
      max: 120,
      ...(r.durationRange && typeof r.durationRange === "object"
        ? r.durationRange as Record<string, unknown>
        : {}),
    },
    pace: (r.pace === "fast" || r.pace === "slow") ? r.pace : "medium",
    evidenceDensity: (r.evidenceDensity === "light" || r.evidenceDensity === "dense") ? r.evidenceDensity : "medium",
    ctaStyle: (["consult", "save", "buy", "follow", "comment"] as const).includes(r.ctaStyle as never)
      ? (r.ctaStyle as ExtractedStructure["ctaStyle"])
      : "consult",
  }
}

function coerceBatchResult(raw: unknown, scripts: string[]): BatchExtractionResult | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const structure = coerceStructure(r.structure)
  if (!structure) return null
  const analysesRaw = Array.isArray(r.analyses) ? r.analyses : []
  const analyses: ScriptAnalysis[] = analysesRaw.map((item, i) => {
    if (!item || typeof item !== "object") return { preview: scripts[i]?.slice(0, 200) ?? "", segments: [] }
    const ir = item as Record<string, unknown>
    const segsRaw = Array.isArray(ir.segments) ? ir.segments : []
    const segs = segsRaw
      .map((s, j) => coerceSegment(s, j + 1))
      .filter((s): s is ExtractedSegment => s !== null)
    return {
      preview: typeof ir.preview === "string" ? ir.preview.slice(0, 200) : (scripts[i]?.slice(0, 200) ?? ""),
      segments: segs,
    }
  })
  return { analyses, structure }
}

// ─── 错误类型与 LLM 重试工具 ──────────────────────────────

/** 批量输入超出 MAX_BATCH_INPUT 时抛出。route 层捕获后返回 400。 */
export class BatchTooLargeError extends Error {
  constructor(public limit: number, public actual: number) {
    super(`批量文案数量超过上限（最多 ${limit} 条，当前 ${actual} 条）`)
    this.name = "BatchTooLargeError"
  }
}

export function isBatchTooLargeError(err: unknown): err is BatchTooLargeError {
  return err instanceof BatchTooLargeError
}

// ─── 对外入口（服务端专用：依赖 LLMClient）────────────────

/** 调用 LLM 批量提取文案结构。
 *  - 一次最多分析 MAX_SCRIPTS_PER_CALL 条；
 *  - 超过则分批调用，最后合并 analyses 并以最后一次的结构为基准（结构共性稳定时可接受）。
 *  - LLM 失败时抛错，由调用方决定降级策略。 */
export async function extractStructuresFromBatch(
  scripts: string[],
): Promise<BatchExtractionResult> {
  const valid = scripts.map((s) => s.trim()).filter(Boolean)
  if (valid.length === 0) {
    throw new Error("没有可分析的文案内容")
  }
  if (valid.length > MAX_BATCH_INPUT) {
    throw new BatchTooLargeError(MAX_BATCH_INPUT, valid.length)
  }

  // 分批：每批 MAX_SCRIPTS_PER_CALL 条
  const batches: string[][] = []
  for (let i = 0; i < valid.length; i += MAX_SCRIPTS_PER_CALL) {
    batches.push(valid.slice(i, i + MAX_SCRIPTS_PER_CALL))
  }

  const llm = LLMClient.shared()
  const allAnalyses: ScriptAnalysis[] = []
  let finalStructure: ExtractedStructure | null = null

  for (const batch of batches) {
    const { data } = await callLLMJsonWithRetry(
      llm,
      {
        system: buildExtractionSystemPrompt(),
        user: buildExtractionUserPrompt(batch),
        temperature: 0.2,
        maxTokens: 4000,
      },
      "结构提取结果解析失败",
    )
    const coerced = coerceBatchResult(data, batch)
    if (!coerced) throw new Error("结构提取结果校验失败，模型返回数据不完整")
    allAnalyses.push(...coerced.analyses)
    finalStructure = coerced.structure
  }

  return {
    analyses: allAnalyses,
    structure: finalStructure!,
  }
}
