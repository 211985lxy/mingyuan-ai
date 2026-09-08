/**
 * Prompt Registry：进程内缓存 + 同步读 + 后台异步回源（stale-while-revalidate）。
 *
 * 设计要点（对齐 2026-09-07-prompt-registry-design.md）：
 * 1. **同步优先**：`get` / `getMessages` 全部同步返回，永不 await、永不抛错，
 *    因此同步纯函数（如 buildExtractionPrompt）无需改成 async。
 * 2. **未命中立即回落内置 seed**：seed v1 是六个 prompt 的逐字原文，
 *    保证首次行为与迁移前零差异；同时 fire-and-forget 触发 refresh 回源 DB。
 * 3. **DB 失败不阻塞**：catch 吞掉、保留 seed，每个 key 只 warn 一次。
 * 4. Prisma 走 lazy `import("@/lib/prisma")`：不在模块顶层 import，
 *    避免在无 DB 的单测/edge 环境产生副作用。
 */

import type { ChatMessage } from "@/lib/llm/types"

import { PROMPT_SEEDS } from "./seeds"
import {
  normalizeStatus,
  normalizeType,
  seedToRecord,
  selectVersion,
  type GetOptions,
  type PromptRecord,
  type PromptSeed,
} from "./types"

/** Prisma 行的最小契约（未生成客户端时也能编译通过）。 */
interface PromptVersionRow {
  templateKey?: string
  version?: number
  content?: string
  type?: string
  status?: string
}

interface PromptVersionDelegate {
  findMany(args: {
    where: { templateKey: string }
    orderBy?: { version: "asc" | "desc" }
    take?: number
  }): Promise<PromptVersionRow[]>
}

interface PrismaLike {
  promptVersion?: PromptVersionDelegate
}

/** 回源失败后的重试节流窗口（ms）：避免每个请求都打一次坏掉的 DB。 */
const REFRESH_RETRY_INTERVAL_MS = 60_000
/** 缓存 TTL（ms）：命中后超过该时长即触发后台回源（stale-while-revalidate），DB 改版最迟一个 TTL 生效。 */
export const PROMPT_CACHE_TTL_MS = 5 * 60_000

interface PromptRegistry {
  /** 同步。命中缓存返回；未命中立即返回 seed 并后台回源。永不抛错、永不 await。 */
  get(key: string, opts?: GetOptions): PromptRecord
  /** 同步。直接产出 CompletionOptions.messages 的 [system, user]。 */
  getMessages(key: string, userPrompt: string, opts?: GetOptions): ChatMessage[]
  /** 同步。getMessages + promptMeta（key+version），供 complete 的可观测关联（P1）。 */
  resolveForCompletion(
    key: string,
    userPrompt: string,
    opts?: GetOptions,
  ): { messages: ChatMessage[]; promptMeta: { key: string; version: number } }
  /** 异步回源；失败回落 seed 并 warn 一次。 */
  refresh(key: string): Promise<void>
  /** 批量预热（可选，不强制接 instrumentation）。 */
  hydrate(keys?: string[]): Promise<void>
  /** P1 手动热更：清缓存后全量回源（管理动作触发，失败回落 seed）。 */
  reload(): Promise<void>
  /** 注册内置兜底 seed（同 key 覆盖）。 */
  registerSeed(seed: PromptSeed): void
  /** 仅测试用：清空全部进程内状态。 */
  __resetForTest(): void
}

// ── 进程内状态 ────────────────────────────────────────────────────────────

/** key → 该 key 下所有 DB 版本（空数组表示"查过但没有版本"）。 */
const cache = new Map<string, PromptRecord[]>()
/** in-flight 回源去重：同 key 并发只打一次 DB。 */
const inflight = new Map<string, Promise<void>>()
/** 已 warn 过的 key（只打一次，避免日志风暴）。 */
const warned = new Set<string>()
/** 内置 seed。 */
const seeds = new Map<string, PromptSeed>()
/** 回源失败时间戳，用于节流重试。 */
const failedAt = new Map<string, number>()
/** 成功回源时间戳：TTL 热更判定用。 */
const fetchedAt = new Map<string, number>()
let seedsLoaded = false

// ── 内部工具 ──────────────────────────────────────────────────────────────

/**
 * @description 注册seed
 * @param seed - 种子数据
 * @returns void
 */
function registerSeed(seed: PromptSeed): void {
  if (!seed || typeof seed.key !== "string" || seed.key.length === 0) return
  if (typeof seed.content !== "string") return
  const normalized: PromptSeed = {
    key: seed.key,
    domain: typeof seed.domain === "string" && seed.domain ? seed.domain : "general",
    description: seed.description,
    version: typeof seed.version === "number" ? seed.version : 1,
    type: seed.type ?? "system",
    content: seed.content,
    fixtureKey: seed.fixtureKey,
  }
  seeds.set(normalized.key, normalized)
}

/** 首次使用时把内置 seed 灌进来（惰性，避免模块副作用）。 */
function ensureSeeds(): void {
  if (seedsLoaded) return
  seedsLoaded = true
  for (const seed of PROMPT_SEEDS) registerSeed(seed)
}

/**
 * @description warnonce
 * @param key - key
 * @param error - 错误对象
 * @returns void
 */
function warnOnce(key: string, error: unknown): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn("[prompt-registry]", key, error)
}

/** 兜底记录：内置 seed 优先；未注册则退化为空串（仍然不抛错）。 */
function fallbackRecord(key: string): PromptRecord {
  const seed = seeds.get(key)
  if (seed) return seedToRecord(seed)
  return { key, version: 0, content: "", type: "system", status: "draft", fromSeed: true }
}

let prismaModulePromise: Promise<unknown> | null = null

/** 单次动态导入并缓存 promise：反复 import() 同一 mock 模块在测试运行器下会间歇挂起。 */
async function loadPrismaModule(): Promise<{ prisma?: PrismaLike }> {
  prismaModulePromise ??= import("@/lib/prisma")
  try {
    return (await prismaModulePromise) as { prisma?: PrismaLike }
  } catch (error) {
    prismaModulePromise = null
    throw error
  }
}

/** 拉 DB 版本并归一化为 PromptRecord[]。抛错由调用方处理。 */
async function loadVersions(key: string): Promise<PromptRecord[]> {
  const mod = await loadPrismaModule()
  const client = mod?.prisma
  if (!client?.promptVersion?.findMany) {
    throw new Error("prisma.promptVersion 不可用（Prisma 客户端未生成或未迁移）")
  }
  const rows = await client.promptVersion.findMany({
    where: { templateKey: key },
    orderBy: { version: "desc" },
    // 单个模板 key 的版本数天然有限，封顶防异常数据拖垮全量查询
    take: 50,
  })
  return (rows ?? []).map((row) => ({
    key: typeof row.templateKey === "string" && row.templateKey ? row.templateKey : key,
    version: typeof row.version === "number" ? row.version : 0,
    content: typeof row.content === "string" ? row.content : "",
    type: normalizeType(row.type ?? "system"),
    status: normalizeStatus(row.status ?? "draft"),
    fromSeed: false,
  }))
}

/** 回源一次；失败只 warn 一次并保留 seed。永不 reject。 */
async function runRefresh(key: string): Promise<void> {
  try {
    const versions = await loadVersions(key)
      cache.set(key, versions)
    fetchedAt.set(key, Date.now())
    failedAt.delete(key)
  } catch (error) {
    failedAt.set(key, Date.now())
    warnOnce(key, error)
  }
}

/** 启动一次回源并登记 in-flight（同 key 去重）。 */
function startRefresh(key: string): Promise<void> {
  const existing = inflight.get(key)
  if (existing) return existing
  const task = runRefresh(key)
  const tracked = task.then(
    () => {
      inflight.delete(key)
    },
    () => {
      inflight.delete(key)
    },
  )
  inflight.set(key, tracked)
  return tracked
}

/** 判断是否需要（重新）回源：没查过、或上次失败已过节流窗口。 */
function needsRefresh(key: string): boolean {
  if (!cache.has(key)) {
    const lastFailed = failedAt.get(key)
    if (typeof lastFailed === "number" && Date.now() - lastFailed < REFRESH_RETRY_INTERVAL_MS) {
      return false
    }
    return true
  }
  return false
}

// ── 对外 API ──────────────────────────────────────────────────────────────

/**
 * @description get
 * @param key - key
 * @param opts - 配置项
 * @returns PromptRecord
 */
function get(key: string, opts?: GetOptions): PromptRecord {
  try {
    ensureSeeds()
    const versions = cache.get(key)
    if (versions && versions.length > 0) {
      // P1 热更：命中超过 TTL 即后台回源，本请求仍返回当前值（stale-while-revalidate）
      const fetched = fetchedAt.get(key) ?? 0
      if (Date.now() - fetched > PROMPT_CACHE_TTL_MS && !inflight.has(key)) {
        void startRefresh(key)
      }
      const picked = selectVersion(versions, opts)
      if (picked) return picked
      return fallbackRecord(key)
    }
    if (versions) return fallbackRecord(key) // 查过但 DB 无版本
    if (needsRefresh(key)) void startRefresh(key)
    return fallbackRecord(key)
  } catch (error) {
    warnOnce(key, error)
    return fallbackRecord(key)
  }
}

/**
 * @description 获取messages
 * @param key - key
 * @param userPrompt - 用户提示词
 * @param opts - 配置项
 * @returns ChatMessage[]
 */
function getMessages(key: string, userPrompt: string, opts?: GetOptions): ChatMessage[] {
  const record = get(key, opts)
  return [
    { role: "system", content: record.content },
    { role: "user", content: userPrompt },
  ]
}

/**
 * @description 解析completion输入（messages + prompt 资产元数据）
 * @param key - key
 * @param userPrompt - 用户提示词
 * @param opts - 配置项
 * @returns messages 与 promptMeta
 */
function resolveForCompletion(
  key: string,
  userPrompt: string,
  opts?: GetOptions,
): { messages: ChatMessage[]; promptMeta: { key: string; version: number } } {
  const record = get(key, opts)
  return {
    messages: [
      { role: "system", content: record.content },
      { role: "user", content: userPrompt },
    ],
    promptMeta: { key: record.key, version: record.version },
  }
}

/**
 * @description refresh
 * @param key - key
 * @returns Promise<void>
 */
function refresh(key: string): Promise<void> {
  ensureSeeds()
  return startRefresh(key)
}

/**
 * @description hydrate
 * @param keys - keys
 * @returns Promise<void>
 */
async function hydrate(keys?: string[]): Promise<void> {
  ensureSeeds()
  const targets = keys && keys.length > 0 ? keys : Array.from(seeds.keys())
  await Promise.all(targets.map((key) => startRefresh(key)))
}

/**
 * @description 重置fortest
 * @returns void
 */
function __resetForTest(): void {
  cache.clear()
  inflight.clear()
  warned.clear()
  seeds.clear()
  failedAt.clear()
  fetchedAt.clear()
  seedsLoaded = false
}

/**
 * @description 手动热更：清空缓存并立即回源全部 seed key（P1 reload 开关）
 * @returns Promise<void> 全部回源完成后 resolve；失败不抛（回落 seed）
 */
async function reload(): Promise<void> {
  ensureSeeds()
  cache.clear()
  fetchedAt.clear()
  failedAt.clear()
  for (const key of seeds.keys()) {
    await runRefresh(key)
  }
}

export const promptRegistry: PromptRegistry = {
  get,
  getMessages,
  resolveForCompletion,
  refresh,
  hydrate,
  reload,
  registerSeed,
  __resetForTest,
}

export type { PromptRegistry }
