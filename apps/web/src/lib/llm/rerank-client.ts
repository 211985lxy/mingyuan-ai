import { env } from "@/env"
import {
  applyRerankOrder,
  buildRerankDocuments,
  parseRerankResponse,
  shouldRerank,
  type RerankScore,
} from "@/lib/llm/rerank"

/**
 * Rerank 精排（P2）—— 网络层
 *
 * 纯逻辑（文档构造 / 响应解析 / 重排赋分）在 `rerank.ts`，本文件只负责发请求。
 *
 * 为什么不引依赖：rerank 端点不在 OpenAI SDK 的覆盖范围内
 * （`client.embeddings.create` 那种调用没有对应方法），本仓的既有惯例就是裸 `fetch`
 * （见 `account-industry-sources.ts` / `aliyun-asr.ts` / `chanjing.ts`）。
 * 一次 POST，没有流式、没有重试、没有 SDK 的必要。
 *
 * 与服务商的关系：SiliconFlow 的 `/v1/rerank` 与现有 embedding **共用同一个 API Key 与 base URL**
 * （`EMBEDDING_API_KEY` / `SILICONFLOW_API_KEY`、`EMBEDDING_BASE_URL`），
 * 所以本次接入**零新增密钥、零新增服务**。
 *
 * 降级原则：任何失败（超时 / 非 2xx / JSON 畸形 / 全部 index 越界）都返回 `null`，
 * 由调用方回落到 RRF 融合结果。**绝不返回空数组** —— 那会让「精排服务抖动」
 * 表现成「知识库突然什么都检不到」。检索链路上，rerank 是增强，不是依赖。
 */

/** 与 `embeddings.ts` 的 base URL 保持同一默认值 */
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1"

/** 与仓库内既有外部调用（`account-industry-sources.ts`）一致的超时量级 */
const RERANK_TIMEOUT_MS = 8000

/** 默认模型。中文效果稳定，且是本仓 embedding 同源的 BGE 系列。 */
const DEFAULT_RERANK_MODEL = "BAAI/bge-reranker-v2-m3"

/** 日志前缀，便于在检索链路的噪声里 grep */
const LOG_PREFIX = "[rerank]"

export interface RerankEntriesInput<T> {
  /** 查询文本（调用方决定是否含选题标题，见 `knowledge-retrieval.ts`） */
  query: string
  /** 融合后的候选，已按融合分降序 */
  candidates: ReadonlyArray<T>
  /** 最终需要的条目数 */
  topK: number
}

/**
 * @description 精排开关。需同时满足：显式开启 + 有可用密钥。
 * 缺密钥时静默关闭而不是抛错——与 embedding 的 `getClient()` 返回 null 同风格。
 * @returns 是否启用
 */
export function isRerankEnabled(): boolean {
  if (env.KNOWLEDGE_RERANK_ENABLED !== "true") return false
  return Boolean(resolveApiKey())
}

/**
 * @description 对候选做 Cross-Encoder 精排。
 *
 * 短路条件（都不发请求）：开关关、候选不足、查询为空。
 * 失败一律返回 `null`，调用方回落融合结果。
 * @param input - query / candidates / topK
 * @returns 重排后的条目；不适用或失败时 `null`
 */
export async function rerankEntries<T extends { id: string; title: string; content: string; score: number }>(
  input: RerankEntriesInput<T>,
): Promise<T[] | null> {
  const topK = Math.max(1, Math.floor(input.topK))
  if (!isRerankEnabled()) return null
  if (!input.query.trim()) return null
  if (!shouldRerank(input.candidates.length, topK)) return null

  const documents = buildRerankDocuments(input.candidates)

  try {
    const payload = await requestRerank({
      query: input.query,
      documents,
      topN: topK,
    })
    const scores = parseRerankResponse(payload, input.candidates.length)
    if (scores.length === 0) {
      console.warn(`${LOG_PREFIX} 响应无有效结果，回落融合顺序`)
      return null
    }
    return applyRerankOrder(input.candidates, scores, topK)
  } catch (error) {
    // 超时 / 429 / 5xx / JSON 解析失败都走这里。不重试：检索是延迟敏感链路，
    // 一次 rerank 失败不该让首字时间再叠一个 8s。
    console.warn(
      `${LOG_PREFIX} 精排失败，回落融合顺序：`,
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

interface RerankRequest {
  query: string
  documents: string[]
  topN: number
}

async function requestRerank(request: RerankRequest): Promise<unknown> {
  const response = await fetch(`${resolveBaseUrl()}/rerank`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.KNOWLEDGE_RERANK_MODEL || DEFAULT_RERANK_MODEL,
      query: request.query,
      documents: request.documents,
      top_n: request.topN,
      // 不回传原文：我们已持有条目，回传纯属浪费带宽
      return_documents: false,
      // 刻意不传 max_chunks_per_doc / overlap_tokens —— 这两个字段只有
      // BAAI/bge-reranker-v2-m3 与 netease-youdao/bce-reranker-base_v1 支持，
      // 一旦 `KNOWLEDGE_RERANK_MODEL` 换成 Qwen3-Reranker 系列就会 400。
      // 用文档截断（RERANK_DOC_MAX_CHARS）达成同样的「长文控制」目的，且与模型解耦。
    }),
    signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function resolveBaseUrl(): string {
  const raw = env.EMBEDDING_BASE_URL || DEFAULT_BASE_URL
  return raw.replace(/\/+$/, "")
}

function resolveApiKey(): string {
  return env.EMBEDDING_API_KEY || env.SILICONFLOW_API_KEY || ""
}
