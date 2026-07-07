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
  const enabled = process.env.EMBEDDING_ENABLED === "true"
  const baseURL =
    process.env.EMBEDDING_BASE_URL || "https://api.siliconflow.cn/v1"
  const apiKey =
    process.env.EMBEDDING_API_KEY || process.env.SILICONFLOW_API_KEY || ""
  const model = process.env.EMBEDDING_MODEL || "BAAI/bge-large-zh-v1.5"
  const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || "1024", 10)

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

/** Compute cosine similarity between two vectors. */
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

/** L2-normalize a vector in place (modifies the array). */
export function normalizeVector(v: number[]): number[] {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return v
  for (let i = 0; i < v.length; i++) v[i] /= norm
  return v
}

// ─── Content hash ───────────────────────────────────────────────────────────

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
export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const client = getClient()
  if (!client) return null

  const config = readConfig()

  // BGE 系列模型 token 上限约 512（≈1500 中文字符），过长的 input 会触发 400。
  // 截断到安全长度，避免批量调用时刷屏 400。
  const maxChars = config.model.startsWith("BAAI/bge") ? 1500 : 8000
  const truncated = text.slice(0, maxChars)

  const tryCreate = () =>
    client.embeddings.create({
      model: config.model,
      input: truncated,
      // 部分模型（如 OpenAI ada-002）支持 dimensions 参数，部分（如 BGE）不支持
      // 仅当模型名以 text-embedding 开头时传递 dimensions
      ...(config.model.startsWith("text-embedding") ? { dimensions: config.dimensions } : {}),
    })

  try {
    const response = await tryCreate()

    const data = response.data[0]
    if (!data) return null

    return {
      vector: data.embedding,
      model: response.model,
      dimensions: config.dimensions,
      tokensUsed: response.usage?.prompt_tokens ?? 0,
    }
  } catch {
    // 失败一次重试（间歇性 400/网络抖动），仍失败则降级返回 null（上层会回退到 raw 检索）
    try {
      const response = await tryCreate()
      const data = response.data[0]
      if (!data) return null
      return {
        vector: data.embedding,
        model: response.model,
        dimensions: config.dimensions,
        tokensUsed: response.usage?.prompt_tokens ?? 0,
      }
    } catch (retryError) {
      console.warn(
        `[embedding] generation failed (model=${config.model}, inputLen=${truncated.length}):`,
        retryError,
      )
      return null
    }
  }
}

// ─── Database operations ────────────────────────────────────────────────────

/**
 * Ensure a KnowledgeEmbedding row exists for the given knowledge entry.
 * - Skips if the content hasn't changed (contentHash matches).
 * - Gracefully handles missing entry, disabled embedding.
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
            projectId: input.projectId,
            status: "active",
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
  const fallback = await prisma.knowledgeEntry.findMany({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      status: "active",
    },
    orderBy: { sortOrder: "asc" },
    take: topK,
    select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
  })

  return {
    entries: fallback.map((e) => ({ ...e, score: 0 })),
    source: "raw",
  }
}

// ─── Sync command ───────────────────────────────────────────────────────────

/**
 * Batch sync: ensure embeddings for all active knowledge entries for a user/project.
 * Returns counts. Useful for admin UI "re-embed" button or script.
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

  const entries = await prisma.knowledgeEntry.findMany({
    where,
    select: { id: true },
  })

  let succeeded = 0
  let failed = 0

  for (const entry of entries) {
    try {
      await ensureKnowledgeEmbedding(entry.id)
      succeeded++
    } catch (error) {
      console.warn(`[embedding] sync failed for entry ${entry.id}:`, error)
      failed++
    }
  }

  return { attempted: entries.length, succeeded, failed }
}
