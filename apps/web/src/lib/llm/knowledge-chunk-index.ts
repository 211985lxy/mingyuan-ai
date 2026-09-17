import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import {
  cosineSimilarity,
  computeContentHash,
  generateEmbedding,
  generateEmbeddings,
  resolveKnowledgeProjectScope,
  type KnowledgePrefilter,
  type ScoredKnowledgeEntry,
} from "@/lib/llm/embeddings"
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  splitIntoChunks,
  type ChunkOptions,
} from "@/lib/llm/chunking"

/**
 * 知识块索引（P0）
 *
 * 在 `KnowledgeEntry` 与向量之间插入一层 `KnowledgeChunk`，
 * 把检索单元从「条目」下沉到 400 字块，解决 5000 字条目只嵌入前 500 字的问题。
 *
 * 写入路径：`ensureEntryChunkEmbeddings`
 * 读取路径：`retrieveEntriesByChunks`
 *
 * 两个路径都受 `KNOWLEDGE_CHUNK_RETRIEVAL_ENABLED` 总开关控制；
 * 关闭时调用方应回退到 `llm/embeddings.ts` 的旧实现（`retrieveRelevantKnowledge`）。
 */

/** 单次检索最多加载的候选块数，防御性上限 */
const FALLBACK_CANDIDATE_LIMIT = 6000

/** 单条目最多保留的块数，与 chunking 模块的上限保持一致 */
const MAX_CHUNKS_PER_ENTRY = 200

/**
 * 每条目透传给下游（P2 精排）的命中块数。
 *
 * 取 3 的实测依据：argmax 那块的余弦常与含答案块只差 9% 量级，
 * 单块会让精排读到「语义相邻但答非所问」的块。同一 query 下直接对比
 * reranker 分：top3 窗口 0.0416 / 0.0353，单块 0.0048 / 0.0041（差 7–9 倍）。
 *
 * ⚠️ 改动此值需同步看 `rerank.ts` 的 `RERANK_DOC_WINDOW_MAX_CHARS` ——
 * 窗口预算按 3 块推导，块数调大而预算没跟上，第 3 块起会被截断丢弃。
 */
const MATCHED_CHUNK_WINDOW = 3

/** 批量嵌入的单批大小，避免一次请求过大 */
const EMBED_BATCH_SIZE = 16

export interface ChunkSyncResult {
  chunks: number
  embedded: number
  reused: number
}

// ─── 开关与参数 ──────────────────────────────────────────────────────────────

/**
 * @description 知识块检索总开关
 * @returns 是否启用
 */
export function isChunkRetrievalEnabled(): boolean {
  return env.KNOWLEDGE_CHUNK_RETRIEVAL_ENABLED === "true" && env.EMBEDDING_ENABLED === "true"
}

/**
 * @description 从 env 解析分块参数
 * @returns 分块参数（size / overlap）
 */
function chunkOptionsFromEnv(): ChunkOptions {
  return {
    size: readPositiveInt(env.KNOWLEDGE_CHUNK_SIZE, DEFAULT_CHUNK_SIZE),
    overlap: readPositiveInt(env.KNOWLEDGE_CHUNK_OVERLAP, DEFAULT_CHUNK_OVERLAP),
  }
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function candidateLimit(): number {
  return readPositiveInt(env.KNOWLEDGE_CHUNK_CANDIDATE_LIMIT, FALLBACK_CANDIDATE_LIMIT)
}

// ─── 向量编解码 ─────────────────────────────────────────────────────────────

/**
 * @description number[] 编码为 Float32 小端字节（1024 维 = 4KB）
 * @param vector 向量
 * @returns Uint8Array，且泛型参数必须写成 `ArrayBuffer` 而不能省
 *
 * 三个写法上的讲究，都是被 Prisma 的类型约束逼出来的：
 *
 * 1. 返回类型**不是** `Buffer`。Prisma 7 的 `Bytes` 字段要求 `Uint8Array<ArrayBuffer>`，
 *    而 TS 5.7 起 `Buffer` 的类型是 `Buffer<ArrayBufferLike>`，赋值被拒。
 * 2. 也**不能**省成 `: Uint8Array` —— 泛型默认值就是 `ArrayBufferLike`，
 *    一样不满足约束。必须显式写 `Uint8Array<ArrayBuffer>`。
 * 3. 实现里先按字节数建 `Uint8Array`（`new Uint8Array(n)` 推断出的正是
 *    `Uint8Array<ArrayBuffer>`），再用 `Float32Array` 视图写入 —— 两个视图共享同一段内存，
 *    零额外拷贝，也避开了 `Float32Array.buffer` 被推断为 `ArrayBufferLike` 的问题。
 */
export function encodeVector(vector: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(vector.length * 4)
  const view = new Float32Array(bytes.buffer)
  view.set(vector)
  return bytes
}

/**
 * @description 字节解码回 Float32Array；补齐 4 字节对齐，长度不足时按 0 填充
 * @param raw 数据库读出的字节
 * @param dimensions 期望维度
 * @returns Float32Array
 */
export function decodeVector(raw: Uint8Array, dimensions: number): Float32Array {
  const source = Buffer.from(raw)
  const usable = Math.min(dimensions, Math.floor(source.byteLength / 4))
  const aligned = new ArrayBuffer(dimensions * 4)
  new Uint8Array(aligned).set(source.subarray(0, usable * 4))
  return new Float32Array(aligned)
}

/**
 * @description 块级内容指纹：把模型与分块参数一并计入，
 * 这样改动 size/overlap/model 会自动触发全量重建，不会留下新旧混用的脏数据。
 * @param text 块文本
 * @param model 嵌入模型
 * @param options 分块参数
 * @returns 64 位十六进制哈希
 */
function chunkFingerprint(text: string, model: string, options: ChunkOptions): string {
  return computeContentHash(`${model}|${options.size}|${options.overlap}|${text}`)
}

// ─── 写入路径 ───────────────────────────────────────────────────────────────

interface ChunkDraft {
  idx: number
  text: string
  fingerprint: string
}

/**
 * @description 确保某条知识的全部块都已入库并完成向量化。
 * 内容未变的块直接跳过（指纹相同），只补新增与失效的块。
 * @param entryId 知识条目 id
 * @returns 各计数
 */
export async function ensureEntryChunkEmbeddings(entryId: string): Promise<ChunkSyncResult> {
  const empty: ChunkSyncResult = { chunks: 0, embedded: 0, reused: 0 }
  if (!isChunkRetrievalEnabled()) return empty

  const entry = await prisma.knowledgeEntry.findUnique({
    where: { id: entryId },
    select: { id: true, title: true, content: true },
  })
  if (!entry) return empty

  const options = chunkOptionsFromEnv()
  const drafts = buildDrafts(entry.content, options)
  if (drafts.length === 0) return empty

  await pruneStaleChunks(entryId, drafts.length)

  const existing = await loadCompletedFingerprints(entryId)
  const stale = drafts.filter((draft) => existing.get(draft.idx) !== draft.fingerprint)

  await persistPendingChunks(entryId, stale)
  const embedded = await embedDrafts(entryId, stale)

  return { chunks: drafts.length, embedded, reused: drafts.length - stale.length }
}

function buildDrafts(content: string, options: ChunkOptions): ChunkDraft[] {
  const model = env.EMBEDDING_MODEL || "BAAI/bge-large-zh-v1.5"
  return splitIntoChunks(content, options)
    .slice(0, MAX_CHUNKS_PER_ENTRY)
    .map((piece) => ({
      idx: piece.idx,
      text: piece.text,
      fingerprint: chunkFingerprint(piece.text, model, options),
    }))
}

async function loadCompletedFingerprints(entryId: string): Promise<Map<number, string>> {
  const rows = await prisma.knowledgeChunk.findMany({
    where: { entryId, status: "completed" },
    select: { idx: true, contentHash: true },
    take: MAX_CHUNKS_PER_ENTRY,
  })
  return new Map(rows.map((row) => [row.idx, row.contentHash]))
}

/** 条目变短时清掉尾部多余块，避免残留旧内容被召回 */
async function pruneStaleChunks(entryId: string, keepCount: number): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({
    where: { entryId, idx: { gte: keepCount } },
  })
}

/**
 * 为**失效**块落 pending 行，保证块文本与序号就位后向量才能回写。
 * 只能传 `stale`：传复用块会漏掉新块的插入，`embedDrafts` 的 update 会抛 P2025。
 */
async function persistPendingChunks(entryId: string, drafts: ChunkDraft[]): Promise<void> {
  for (const draft of drafts) {
    await prisma.knowledgeChunk.upsert({
      where: { entryId_idx: { entryId, idx: draft.idx } },
      create: {
        entryId,
        idx: draft.idx,
        text: draft.text,
        contentHash: draft.fingerprint,
        status: "pending",
      },
      update: { text: draft.text, contentHash: draft.fingerprint, status: "pending" },
    })
  }
}

/** 分批生成向量并回写；单批失败只标记该批，不阻断整条目 */
async function embedDrafts(entryId: string, drafts: ChunkDraft[]): Promise<number> {
  let embedded = 0

  for (let start = 0; start < drafts.length; start += EMBED_BATCH_SIZE) {
    const batch = drafts.slice(start, start + EMBED_BATCH_SIZE)
    const results = await generateEmbeddings(batch.map((draft) => draft.text))

    for (let i = 0; i < batch.length; i++) {
      const result = results[i]
      await writeChunkVector(entryId, batch[i], result)
      if (result) embedded++
    }
  }

  return embedded
}

async function writeChunkVector(
  entryId: string,
  draft: ChunkDraft,
  result: { vector: number[]; model: string; dimensions: number } | null,
): Promise<void> {
  const data = result
    ? {
        embedding: encodeVector(result.vector),
        dimensions: result.dimensions,
        model: result.model,
        status: "completed",
        errorMessage: null,
      }
    : { status: "failed", errorMessage: "Embedding service unavailable" }

  await prisma.knowledgeChunk.update({
    where: { entryId_idx: { entryId, idx: draft.idx } },
    data,
  })
}

// ─── 读取路径 ───────────────────────────────────────────────────────────────

export interface ChunkRetrieveInput {
  userId: string
  projectId: string
  query: string
  topicTitle?: string
  topicRationale?: string
  topK?: number
  prefilter?: KnowledgePrefilter
}

/** 一次命中：块原文 + 它与查询的余弦 */
interface ChunkHit {
  score: number
  text: string
}

/** 条目级聚合：entry 的 type 由 `loadCandidateChunks` 的 select 决定 */
type EntryFields = Omit<ScoredKnowledgeEntry, "score" | "matchedChunkTexts">

interface EntryAccumulator {
  entry: EntryFields
  /** 该条目所有命中块里的最高余弦（条目级分数沿用此定义，不求和：长条目块多会虚高） */
  score: number
  /** 余弦最高的前 `MATCHED_CHUNK_WINDOW` 块，降序 */
  hits: ChunkHit[]
}

/**
 * 把一次命中按余弦降序插入定长列表，只保留前 `limit` 个。
 * 定长而非全量收集：候选可达数千块，全存会让「块多但无关」的条目白占内存。
 */
function keepTopHits(hits: ChunkHit[], hit: ChunkHit, limit: number): void {
  const worst = hits[hits.length - 1]
  if (hits.length >= limit && worst && hit.score <= worst.score) return

  const at = hits.findIndex((existing) => hit.score > existing.score)
  if (at === -1) hits.push(hit)
  else hits.splice(at, 0, hit)

  if (hits.length > limit) hits.length = limit
}

/**
 * @description 按知识块做向量召回，再聚合回知识条目。
 * 同一条目命中多块时取最高分块 —— 不用求和，否则长条目会因块多而虚高。
 * @param input 检索输入（与旧实现同形，便于替换）
 * @returns 条目级结果，按分数降序
 */
export async function retrieveEntriesByChunks(input: ChunkRetrieveInput): Promise<ScoredKnowledgeEntry[]> {
  const topK = input.topK ?? 12
  const queryVector = await generateEmbedding(buildQueryText(input))
  if (!queryVector) return []

  const rows = await loadCandidateChunks(input)

  // 值类型直接是 ScoredKnowledgeEntry：loadCandidateChunks 的 select 里没有 score
  // （分数要等块级命中合并时才算），所以在这里 spread 补上，
  // 而不是给 entry 再套一层 { entry, score } 包装 —— 后者与返回类型不符。
  //
  // 同时把**命中的若干块原文**一并带出（`matchedChunkTexts`）。这不是锦上添花：
  // 条目可长达数千字，而这里是按 400 字块比余弦的，真正命中查询的是**某一块**。
  // 只返回条目而丢掉块，下游（P2 精排）就只剩「条目开头」一个视角，
  // 与向量路的判据范围不一致 —— 长尾用例被系统性压低（见 `rerank.ts` 顶部）。
  //
  // 为什么要**多块**而不是只留 argmax 那一块：实测 argmax 经常不是含答案的块。
  // badcase 用例里答案在 idx=3（cos 0.5128），argmax 却是 idx=1（cos 0.5591），
  // 两者只差 9% —— 单块方案会把「语义相邻但答非所问」的块喂给精排。
  // 直接对比同一 query 下 reranker 的 relevance_score：top3 窗口是单块的 7–9 倍
  // （0.0416 vs 0.0048 / 0.0353 vs 0.0041）。
  const best = new Map<string, EntryAccumulator>()
  for (const row of rows) {
    const vector = decodeVector(row.embedding as Uint8Array, row.dimensions)
    const score = cosineSimilarity(queryVector.vector, Array.from(vector))
    if (!Number.isFinite(score)) continue

    const current = best.get(row.entry.id)
    if (!current) {
      best.set(row.entry.id, {
        entry: row.entry,
        score,
        hits: [{ score, text: row.text }],
      })
      continue
    }
    if (score > current.score) current.score = score
    keepTopHits(current.hits, { score, text: row.text }, MATCHED_CHUNK_WINDOW)
  }

  return [...best.values()]
    .map(({ entry, score, hits }) => ({
      ...entry,
      score,
      matchedChunkTexts: hits.map((hit) => hit.text),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function buildQueryText(input: ChunkRetrieveInput): string {
  const parts = [input.query]
  if (input.topicTitle) parts.push(`选题：${input.topicTitle}`)
  if (input.topicRationale) parts.push(`选题理由：${input.topicRationale}`)
  return parts.join("\n")
}

/**
 * 候选块下推：项目隔离与类别/分级预过滤全部走 SQL，
 * 缩窄后再进内存算余弦。`take` 为硬上限，防止语料膨胀后全量加载。
 */
async function loadCandidateChunks(input: ChunkRetrieveInput) {
  const projectScope = resolveKnowledgeProjectScope(input.projectId)
  const knowledgeScope = projectScope.projectId ? projectScope : { userId: input.userId, ...projectScope }
  const hasCategoryFilter = Boolean(input.prefilter?.categories?.length)
  const hasGradeFilter = Boolean(input.prefilter?.valueGrades?.length)

  return prisma.knowledgeChunk.findMany({
    where: {
      status: "completed",
      entry: {
        status: "active",
        ...knowledgeScope,
        ...(hasCategoryFilter ? { category: { in: input.prefilter!.categories } } : {}),
        ...(hasGradeFilter ? { valueGrade: { in: input.prefilter!.valueGrades } } : {}),
      },
    },
    select: {
      // text 必须取：命中块的原文要透传给下游精排，否则 reranker 只能读条目开头
      // （`ScoredKnowledgeEntry.matchedChunkTexts` 的由来）。块文本本就存在库里，
      // 不额外取它不会省下任何查询，只会让下游丢掉判据。
      //
      // 代价与取舍：即便 P2 关闭也会多取这一列。之所以不做成
      // 「仅当 KNOWLEDGE_RERANK_ENABLED 时才 select text」，是因为那会让
      // **P0 的查询形状依赖 P2 的开关** —— 读路径的返回类型随另一个功能的开关变化，
      // 是更难排查的耦合。当前语料 200 余块、单块 ~450 字，多取约 90KB，
      // 可忽略。语料规模到「数千块」量级时应重新评估此取舍。
      text: true,
      embedding: true,
      dimensions: true,
      entry: {
        select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
      },
    },
    take: candidateLimit(),
  })
}
