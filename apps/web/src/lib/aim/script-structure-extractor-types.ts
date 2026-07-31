/**
 * 文案结构提取 —— 浏览器安全层（类型 + 纯函数）
 *
 * 与 `script-structure-extractor.ts` 分离的原因：extractor 主文件因
 * `extractStructuresFromBatch` 依赖 `LLMClient` → `undici`（Node 专用），
 * 不能被打进浏览器 bundle。客户端组件只能从本文件导入。
 *
 * 本文件严禁 import 任何 Node-only 或服务端 only 模块（如 llm/client、prisma）。
 */

// ─── 类型定义 ──────────────────────────────────────────────

/** 单个结构片段：开头钩子 / 核心内容 / 产品介绍 / 行动号召 等。 */
export interface ExtractedSegment {
  /** 片段语义类型 */
  type:
    | "opening_hook"
    | "core_content"
    | "product_intro"
    | "cta"
    | "evidence"
    | "transition"
    | "emotion"
    | "value_prop"
    | "objection_handling"
    | "other"
  /** 片段名称（中文，简短） */
  label: string
  /** 该片段的写作指令：下次按这个指令填内容 */
  instruction: string
  /** 从原文摘录的代表性例句（≤120 字） */
  example: string
  /** 在整体结构中的排列顺序，从 1 开始 */
  order: number
}

/** 从一批文案中提炼出的通用结构模板。 */
export interface ExtractedStructure {
  /** 结构名称（中文，≤16 字） */
  name: string
  displayName: string
  /** 一句话描述适用场景 */
  description: string
  /** 有序片段列表 */
  segments: ExtractedSegment[]
  /** 开头模式摘要（从首个片段派生） */
  openingPattern: string
  /** 叙事节拍（中段片段 label 列表） */
  narrativeBeats: string[]
  /** 证据/案例槽位数 */
  evidenceSlots: number
  /** 行动号召摘要（从末尾片段派生） */
  ctaSlot: string
  /** 预估时长区间（秒） */
  durationRange: { min: number; max: number }
  /** 节奏：fast | medium | slow */
  pace: "fast" | "medium" | "slow"
  /** 证据密度：light | medium | dense */
  evidenceDensity: "light" | "medium" | "dense"
  /** CTA 风格：consult | save | buy | follow | comment */
  ctaStyle: "consult" | "save" | "buy" | "follow" | "comment"
}

/** 单条文案的拆解结果。 */
export interface ScriptAnalysis {
  /** 原文（截断到前 200 字用于追溯） */
  preview: string
  segments: ExtractedSegment[]
}

/** 批量提取结果：每条文案的拆解 + 聚合后的通用结构模板。 */
export interface BatchExtractionResult {
  analyses: ScriptAnalysis[]
  structure: ExtractedStructure
}

// ─── 常量 ──────────────────────────────────────────────────

export const SCRIPT_DELIMITER = "\n\n---\n\n"

// ─── 文本预处理（纯函数，浏览器安全）──────────────────────

/** 把粘贴的大段文本切成多条文案。
 *  优先按 `---` 分隔；没有分隔符时按双换行段落数判断，超过 3 段视为多条。 */
export function splitScripts(rawText: string): string[] {
  const trimmed = rawText.trim()
  if (!trimmed) return []
  if (trimmed.includes(SCRIPT_DELIMITER.trim())) {
    return trimmed
      .split(/\n*-{3,}\n*/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  // 没有显式分隔符：按双换行切段
  const paragraphs = trimmed.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
  return paragraphs
}

/** 把 ExtractedStructure 转成 VideoStructure.blueprint JSON（兼容现有字段）。 */
export function structureToBlueprint(s: ExtractedStructure) {
  return {
    openingPattern: s.openingPattern,
    narrativeBeats: s.narrativeBeats,
    evidenceSlots: s.evidenceSlots,
    ctaSlot: s.ctaSlot,
    durationRange: s.durationRange,
    pace: s.pace,
    evidenceDensity: s.evidenceDensity,
    ctaStyle: s.ctaStyle,
    // 提取结构独有的有序片段
    segments: s.segments.map((seg) => ({
      type: seg.type,
      label: seg.label,
      instruction: seg.instruction,
      example: seg.example,
      order: seg.order,
    })),
  }
}
