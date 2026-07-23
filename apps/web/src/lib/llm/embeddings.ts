import { env } from "@/env"
import { createHash } from "crypto"
import OpenAI from "openai"
import { prisma } from "@/lib/prisma"

// ─── Config ──────────────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  enabled: boolean
  baseURL: string
  apiKey: string
  model: string
  dimensions: number
}

function readConfig(): EmbeddingConfig {
  const enabled = env.EMBEDDING_ENABLED === "true"
  const baseURL =
    env.EMBEDDING_BASE_URL || "https://api.siliconflow.cn/v1"
  const apiKey =
    env.EMBEDDING_API_KEY || env.SILICONFLOW_API_KEY || ""
  const model = env.EMBEDDING_MODEL || "BAAI/bge-large-zh-v1.5"
  const dimensions = parseInt(env.EMBEDDING_DIMENSIONS || "1024", 10)

  return { enabled, baseURL, apiKey, model, dimensions }
}

// ─── OpenAI-compatible embedding client ─────────────────────────────────────

let _client: OpenAI | null = null

function getClient(): OpenAI | null {
  const config = readConfig()
  if (!config.enabled || !config.apiKey) return null

  if (!_client) {
    _client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: 30000,
    })
  }
  return _client
}

// ─── Vector math ────────────────────────────────────────────────────────────

/**
 * @description 计算两个向量的余弦相似度
 * @param a - 第一个向量
 * @param b - 第二个向量
 * @returns 余弦相似度（0-1，越大越相似）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, nA = 0, nB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    nA += a[i] * a[i]
    nB += b[i] * b[i]
  }
  const denom = Math.sqrt(nA) * Math.sqrt(nB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * @description 对向量进行 L2 归一化（原地修改数组）
 * @param v - 待归一化的向量
 * @returns 归一化后的同一数组引用
 */
export function normalizeVector(v: number[]): number[] {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return v
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

// ─── Content hash ───────────────────────────────────────────────────────────

/**
 * @description 计算内容的 SHA-256 哈希值（用于检测内容变更）
 * @param content - 待哈希的文本内容
 * @returns 64 位十六进制哈希字符串
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 64)
}

// ─── Embedding generation ───────────────────────────────────────────────────

export interface EmbeddingResult {
  vector: number[]
  model: string
  dimensions: number
  tokensUsed: number
}

/**
 * Generate an embedding vector for the given text.
 * Returns null if embedding service is unavailable.
 */
/**
 * @description 生成embedding
 * @param text - 文本
 * @returns Promise<EmbeddingResult | null>
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const results = await generateEmbeddings([text])
  return results[0] ?? null
}

/**
 * 批量生成 embedding（一次 API 调用多个 input）。
 * 失败时返回等长 null 数组；部分实现按 index 对齐。
 */
export async function generateEmbeddings(texts: string[]): Promise<Array<EmbeddingResult | null>> {
  if (!texts.length) return []
  const client = getClient()
  if (!client) return texts.map(() => null)

  const config = readConfig()
  const maxChars = config.model.startsWith("BAAI/bge") ? 1500 : 8000
  const inputs = texts.map((t) => (t || " ").slice(0, maxChars))

  try {
    const response = await client.embeddings.create({
      model: config.model,
      input: inputs,
      ...(config.model.startsWith("text-embedding") ? { dimensions: config.dimensions } : {}),
    })
    const byIndex = new Map<number, number[]>()
    for (const row of response.data ?? []) {
      byIndex.set(row.index, row.embedding)
    }
    return inputs.map((_, i) => {
      const vector = byIndex.get(i) ?? response.data?.[i]?.embedding
      if (!vector?.length) return null
      return {
        vector,
        model: response.model,
        dimensions: config.dimensions,
        tokensUsed: i === 0 ? (response.usage?.prompt_tokens ?? 0) : 0,
      }
    })
  } catch (error) {
    console.warn(
      `[embedding] batch generation failed (model=${config.model}, n=${inputs.length}):`,
      error,
    )
    return texts.map(() => null)
  }
}

// ─── Database operations ────────────────────────────────────────────────────

/**
 * Ensure a KnowledgeEmbedding row exists for the given knowledge entry.
 * - Skips if the content hasn't changed (contentHash matches).
 * - Gracefully handles missing entry, disabled embedding.
 */
/**
 * @description 确保knowledgeembedding
 * @param entryId - 条目唯一标识符
 * @returns Promise<void>
 */
export async function ensureKnowledgeEmbedding(entryId: string): Promise<void> {
  const config = readConfig()
  if (!config.enabled) return

  const entry = await prisma.knowledgeEntry.findUnique({
    where: { id: entryId },
    select: { id: true, content: true, title: true },
  })
  if (!entry) return

  const contentHash = computeContentHash(entry.content)

  // Check existing embedding — skip if content hasn't changed
  const existing = await prisma.knowledgeEmbedding.findUnique({
    where: { entryId },
    select: { contentHash: true, status: true },
  })
  if (existing && existing.contentHash === contentHash && existing.status === "completed") {
    return
  }

  // Generate embedding
  const text = `${entry.title}\n${entry.content}`
  const result = await generateEmbedding(text)

  if (!result) {
    // Mark as failed if we have an existing row, otherwise leave it
    if (existing) {
      await prisma.knowledgeEmbedding.update({
        where: { entryId },
        data: { status: "failed", errorMessage: "Embedding service unavailable" },
      })
    }
    return
  }

  await prisma.knowledgeEmbedding.upsert({
    where: { entryId },
    create: {
      entryId,
      embedding: result.vector,
      dimensions: result.dimensions,
      model: result.model,
      contentHash,
      status: "completed",
    },
    update: {
      embedding: result.vector,
      dimensions: result.dimensions,
      model: result.model,
      contentHash,
      status: "completed",
      errorMessage: null,
    },
  })
}

// ─── Semantic retrieval ─────────────────────────────────────────────────────

export interface ScoredKnowledgeEntry {
  id: string
  title: string
  content: string
  category: string
  tags: unknown
  valueGrade: string | null
  score: number
}

/**
 * 预过滤条件：在算余弦前用 SQL 把候选缩到高价值子集，缓解「全量 200 条进内存」的瓶颈。
 * - categories：限定类别白名单（由策略 categoryBoost 的 key 转换而来）
 * - valueGrades：限定价值分级白名单（通常含 S/A，避免低价值条目进算）
 * 传空对象或 undefined 时退化为原行为（全量）。
 */
export interface KnowledgePrefilter {
  categories?: string[]
  valueGrades?: string[]
}

/**
 * Retrieve top-K relevant knowledge entries by cosine similarity.
 * Falls back to entry-only (no embedding) when embedding is disabled or empty.
 */
/**
 * @description retrieverelevantknowledge
 * @param input - 输入数据
 * @returns Promise<
 */
export async function retrieveRelevantKnowledge(input: {
  userId: string
  projectId: string
  query: string
  topicTitle?: string
  topicRationale?: string
  topK?: number
  prefilter?: KnowledgePrefilter
}): Promise<{
  entries: ScoredKnowledgeEntry[]
  source: "embedding" | "raw"
}> {
  const config = readConfig()
  const topK = input.topK ?? 12
  const prefilter = input.prefilter

  // Build the query text: combine input + topic context for richer embedding
  const queryParts = [input.query]
  if (input.topicTitle) queryParts.push(`选题：${input.topicTitle}`)
  if (input.topicRationale) queryParts.push(`选题理由：${input.topicRationale}`)
  const queryText = queryParts.join("\n")

  // When embedding is enabled, try semantic retrieval
  if (config.enabled) {
    const queryVector = await generateEmbedding(queryText)
    if (queryVector) {
      // 预过滤：把策略侧的 category/valueGrade 偏好下推到 SQL where，
      // 候选缩窄后再进内存算余弦。无 prefilter 时退化为全量（原行为）。
      const hasCategoryFilter = !!prefilter?.categories?.length
      const hasGradeFilter = !!prefilter?.valueGrades?.length
      const rows = await prisma.knowledgeEmbedding.findMany({
        where: {
          status: "completed",
          entry: {
            userId: input.userId,
            status: "active",
            OR: [{ projectId: input.projectId }, { projectId: null }],
            ...(hasCategoryFilter ? { category: { in: prefilter!.categories } } : {}),
            ...(hasGradeFilter ? { valueGrade: { in: prefilter!.valueGrades } } : {}),
          },
        },
        select: {
          embedding: true,
          entry: {
            select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
          },
        },
        // 加 take 上限,防止知识库膨胀后全量加载到内存算余弦导致 OOM/事件循环阻塞。
        // 预过滤已缩窄候选，这里给足 topK * 6 的余量保证召回质量。
        take: hasCategoryFilter || hasGradeFilter ? Math.max(topK * 6, 60) : 200,
      })

      if (rows.length > 0) {
        const scored: ScoredKnowledgeEntry[] = rows
          .map((row) => {
            const embeddingArr = row.embedding as number[]
            return {
              id: row.entry.id,
              title: row.entry.title,
              content: row.entry.content,
              category: row.entry.category,
              tags: row.entry.tags,
              valueGrade: row.entry.valueGrade,
              score: cosineSimilarity(queryVector.vector, embeddingArr),
            }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)

        // 预过滤可能把候选筛空，此时回退一次全量检索，避免漏召回
        if (scored.length === 0 && (hasCategoryFilter || hasGradeFilter)) {
          return retrieveRelevantKnowledge({ ...input, prefilter: undefined })
        }

        return { entries: scored, source: "embedding" }
      }
    }
  }

  // Fallback: return recent active entries (matching old behavior)
  // 优化：先拉取定位核心类条目，再补充其余条目，保证关键定位资料不被挤掉
  const CORE_FALLBACK_CATEGORIES = ["positioning_material", "boss_experience", "product_usp", "customer_pain", "user_insight"]
  const coreTopK = Math.min(Math.ceil(topK / 2), 6)

  const [coreEntries, otherEntries] = await Promise.all([
    prisma.knowledgeEntry.findMany({
      where: {
        userId: input.userId,
        status: "active",
        OR: [{ projectId: input.projectId }, { projectId: null }],
        category: { in: CORE_FALLBACK_CATEGORIES },
      },
      orderBy: { sortOrder: "asc" },
      take: coreTopK,
      select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
    }),
    prisma.knowledgeEntry.findMany({
      where: {
        userId: input.userId,
        status: "active",
        OR: [{ projectId: input.projectId }, { projectId: null }],
        category: { notIn: CORE_FALLBACK_CATEGORIES },
      },
      orderBy: { sortOrder: "asc" },
      take: topK,
      select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
    }),
  ])

  // 合并去重，核心类优先，总数不超 topK
  const seen = new Set(coreEntries.map((e) => e.id))
  const merged = [...coreEntries]
  for (const e of otherEntries) {
    if (merged.length >= topK) break
    if (!seen.has(e.id)) {
      merged.push(e)
      seen.add(e.id)
    }
  }

  return {
    entries: merged.map((e) => ({ ...e, score: 0 })),
    source: "raw",
  }
}

// ─── Sync command ───────────────────────────────────────────────────────────

/**
 * Batch sync: ensure embeddings for all active knowledge entries for a user/project.
 * Returns counts. Useful for admin UI "re-embed" button or script.
 */
/**
 * @description 同步projectembeddings
 * @param input - 输入数据
 * @returns Promise<
 */
export async function syncProjectEmbeddings(input: {
  userId?: string
  projectId?: string
  entryIds?: string[]
}): Promise<{ attempted: number; succeeded: number; failed: number }> {
  const config = readConfig()
  if (!config.enabled) return { attempted: 0, succeeded: 0, failed: 0 }

  const where: Record<string, unknown> = { status: "active" }
  if (input.userId) where.userId = input.userId
  if (input.projectId) where.projectId = input.projectId
  if (input.entryIds) where.id = { in: input.entryIds }

  let attempted = 0
  let succeeded = 0
  let failed = 0
  let cursor: string | undefined

  while (true) {
    const entries = await prisma.knowledgeEntry.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (entries.length === 0) break

    for (const entry of entries) {
      attempted++
      try {
        await ensureKnowledgeEmbedding(entry.id)
        succeeded++
      } catch (error) {
        console.warn(`[embedding] sync failed for entry ${entry.id}:`, error)
        failed++
      }
    }

    cursor = entries.at(-1)?.id
    if (entries.length < 200) break
  }

  return { attempted, succeeded, failed }
}
