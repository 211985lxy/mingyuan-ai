/**
 * 知识条目分块（P0）
 *
 * 为什么需要这个模块
 * ─────────────────
 * 导入侧 `document-parser.ts` 的 `CHUNK_THRESHOLD = 5000`，一条知识条目最长约 5000 字；
 * 而嵌入侧 `llm/embeddings.ts` 对 BGE 模型把输入硬截断到 500 字
 * （`maxChars = config.model.startsWith("BAAI/bge") ? 500 : 8000`）。
 *
 * 两条链路一对接，结果是：**一条 5000 字的条目只有前 500 字进了向量空间，
 * 其余约 90% 的内容在语义检索中永远不可能被召回。**
 *
 * 本模块把检索单元从「条目」下沉到「带重叠的块」，让全部内容进入向量。
 *
 * 核心不变量
 * ──────────
 * **任何块的最终长度 ≤ `CHUNK_EMBED_BUDGET`（480 字）。**
 * 这是保证「内容完整入向量、不再被截断」的硬约束，由参数钳制 + 末尾 clamp 双重兜底。
 * 若将来更换嵌入模型或上调窗口，只需改 `CHUNK_EMBED_BUDGET`。
 *
 * 设计约定
 * ────────
 * - 纯函数、零外部依赖，便于单测；
 * - 确定性输出：同一输入必得同一分块，保证 contentHash 缓存失效判断可靠；
 * - 不在此处计算 contentHash —— 复用 `llm/embeddings.ts` 的 `computeContentHash`，
 *   避免循环依赖与逻辑重复。
 */

export const DEFAULT_CHUNK_SIZE = 400
export const DEFAULT_CHUNK_OVERLAP = 80
export const DEFAULT_CHUNK_MIN_SIZE = 120

/**
 * 单块硬上限（字符）。BGE 系列嵌入窗口约 500 字，留 20 字余量。
 * `size + overlap` 恒不超过此值，因此没有任何内容会在这里被丢掉。
 */
export const CHUNK_EMBED_BUDGET = 480

/** 低于此值的 size 无检索意义，直接抬到该下限 */
const HARD_MIN_SIZE = 80

/** 单条目分块数上限，防御性护栏（正常路径：5000 字段落约 13 块） */
const MAX_CHUNKS_PER_ENTRY = 200

/** 句末边界：保留分隔符在前一句尾部，拼接时可无损还原 */
const SENTENCE_BOUNDARY = /(?<=[。！？；!?;\n])/

/**
 * 段落边界：任意连续换行。
 * 用 `\n+` 而非 `\n{2,}` —— 微信聊天记录、markdown 列表、表格都是单换行的行式结构，
 * 只认空行会把整篇行式文本当成一个巨型段落，退化到纯句级切分。
 */
const PARAGRAPH_BOUNDARY = /\n+/

export interface ChunkOptions {
  /** 目标块大小（字符），默认 400；超过嵌入预算时自动下调 */
  size?: number
  /** 相邻块重叠字符数，默认 80；自动夹到 size/2 以内 */
  overlap?: number
  /** 块最小字符数，低于则并入前一块，默认 120 */
  minSize?: number
}

export interface ChunkPiece {
  /** 在条目内的序号，从 0 开始 */
  idx: number
  /** 块文本（含与前一块的重叠前缀） */
  text: string
}

/**
 * 把一段长文本切成带重叠的检索块。
 *
 * 优先按行（段落）切分，其次句末边界，最后才硬切。
 * 相邻块保留 `overlap` 字重叠，避免答案正好落在切缝上被漏掉。
 *
 * @param text 原始文本（任意长度；支持微信聊天记录、markdown、纯段落）
 * @param options 见 {@link ChunkOptions}
 * @returns 分块列表；输入为空白时返回空数组
 */
export function splitIntoChunks(text: string, options: ChunkOptions = {}): ChunkPiece[] {
  const { size, overlap, minSize } = resolveOptions(options)

  const normalized = normalizeText(text)
  if (!normalized) return []

  const units = buildAtomicUnits(normalized, size)
  const grouped = mergeUndersizedTail(groupUnits(units, size), minSize, size)
  const bounded = grouped.slice(0, MAX_CHUNKS_PER_ENTRY)
  const withOverlap = applyOverlap(bounded, overlap, size)

  return withOverlap.map((chunkText, idx) => ({ idx, text: chunkText }))
}

/**
 * 参数钳制。顺序很重要：
 * 1. 先按嵌入预算压缩 size：`480 - proposedOverlap` 可能为负，必须再抬回 HARD_MIN_SIZE，
 *    否则会得到负的 size 并在 `hardCut` 的步进里炸成 RangeError；
 * 2. 再让 overlap 不超过最终 size/2。
 * 两步之后 `size + overlap ≤ CHUNK_EMBED_BUDGET` 恒成立，无需靠截断兜底。
 */
function resolveOptions(options: ChunkOptions): { size: number; overlap: number; minSize: number } {
  const rawSize = Math.max(HARD_MIN_SIZE, Math.floor(options.size ?? DEFAULT_CHUNK_SIZE))
  const rawOverlap = Math.max(0, Math.floor(options.overlap ?? DEFAULT_CHUNK_OVERLAP))
  const proposedOverlap = Math.min(rawOverlap, Math.floor(rawSize / 2))
  const size = Math.max(HARD_MIN_SIZE, Math.min(rawSize, CHUNK_EMBED_BUDGET - proposedOverlap))
  const overlap = Math.min(rawOverlap, Math.floor(size / 2))
  const minSize = Math.max(1, Math.floor(options.minSize ?? DEFAULT_CHUNK_MIN_SIZE))

  return { size, overlap, minSize }
}

/**
 * 规范化空白：统一换行符、去掉行尾空格、压缩连续空行。
 * 在切分前执行，保证同一语义文本产出稳定分块。
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * 把文本拆成「原子单元」，每个单元长度 ≤ size。
 *
 * 行级优先：单行不超限就整行作为一个单元（保留原有换行）；
 * 超限行降到句级；超限句子才硬切。
 * 行单元自带尾随换行，后续按空串拼接时行与行之间不会被粘连。
 */
function buildAtomicUnits(text: string, size: number): string[] {
  const units: string[] = []

  for (const line of text.split(PARAGRAPH_BOUNDARY)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.length <= size) {
      units.push(`${trimmed}\n`)
      continue
    }

    for (const sentence of splitSentences(trimmed)) {
      if (sentence.length <= size) units.push(sentence)
      else units.push(...hardCut(sentence, size))
    }
  }

  return units
}

/** 按句末标点切句，分隔符保留在前一句末尾 */
function splitSentences(line: string): string[] {
  return line
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** 无标点长串的兜底硬切 */
function hardCut(text: string, size: number): string[] {
  const pieces: string[] = []
  for (let start = 0; start < text.length; start += size) {
    pieces.push(text.slice(start, start + size))
  }
  return pieces
}

/** 贪心装箱：累加单元直到超过 size，再开新块 */
function groupUnits(units: string[], size: number): string[] {
  const chunks: string[] = []
  let current = ""

  for (const unit of units) {
    if (current && current.length + unit.length > size) {
      chunks.push(current)
      current = unit
    } else {
      current += unit
    }
  }

  if (current.trim()) chunks.push(current)
  return chunks
}

/**
 * 末块过短则并入前一块，避免产生「半句话」的碎片块。
 * 仅在合并后仍不超过 size 时执行 —— 宁可留一个小块，
 * 也不允许破坏「块 ≤ size」这一前提（否则叠加 overlap 会突破嵌入预算）。
 */
function mergeUndersizedTail(chunks: string[], minSize: number, size: number): string[] {
  if (chunks.length < 2) return chunks

  const last = chunks[chunks.length - 1]
  if (last.trim().length >= minSize) return chunks

  const previous = chunks[chunks.length - 2]
  if (previous.length + last.length > size) return chunks

  return [...chunks.slice(0, -2), previous + last]
}

/**
 * 给除首块外的每个块前置上一块的尾部 `overlap` 字。
 * 放在最后一步执行，避免与「末块合并」相互影响。
 * 单块最长 `size + overlap ≤ CHUNK_EMBED_BUDGET`；末尾 clamp 为防御性兜底，
 * 正常参数下永不生效。
 */
function applyOverlap(chunks: string[], overlap: number, size: number): string[] {
  const budget = Math.min(size + overlap, CHUNK_EMBED_BUDGET)

  return chunks.map((chunkText, index) => {
    if (index === 0 || overlap <= 0) return chunkText.slice(0, budget)
    return (chunks[index - 1].slice(-overlap) + chunkText).slice(0, budget)
  })
}
