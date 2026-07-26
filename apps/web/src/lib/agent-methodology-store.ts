import { readFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"

/**
 * 智能体方法论统一加载层（DB 优先 + 文件兜底 + 缓存失效）。
 *
 * 三份方法论对应 mingyuan/docs/*-methodology-core.md：
 *  - ip_copywriting（IP 操盘，5 个智能体共用）
 *  - business_diagnosis（商业诊断，仅 business_system_diagnosis）
 *  - event_storytelling（事件方法论，仅 content_producer/work_editor 特定场景）
 *
 * 后台编辑写 DB，并 bump 版本号使内存缓存失效 → 编辑即时生效，无需重启。
 */

export type MethodologyKey = "ip_copywriting" | "business_diagnosis" | "event_storytelling"

export interface MethodologyMeta {
  key: MethodologyKey
  /** 加载块在提示词里的小标题，如 "IP操盘方法论库" */
  blockTitle: string
  /** 展示标题 */
  title: string
  /** 候选文件路径（两种 cwd 形态） */
  fileCandidates: string[]
  /** 相对仓库的展示路径（溯源用） */
  displayFilePath: string
}

export const METHODOLOGY_META: Record<MethodologyKey, MethodologyMeta> = {
  ip_copywriting: {
    key: "ip_copywriting",
    blockTitle: "IP操盘方法论库",
    title: "IP 操盘方法论",
    fileCandidates: [
      path.resolve(process.cwd(), "../../docs/methodologies/ip-copywriting-methodology-core.md"),
      path.resolve(process.cwd(), "../../docs/ip-copywriting-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/methodologies/ip-copywriting-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/ip-copywriting-methodology-core.md"),
    ],
    displayFilePath: "mingyuan/docs/methodologies/ip-copywriting-methodology-core.md",
  },
  business_diagnosis: {
    key: "business_diagnosis",
    blockTitle: "商业诊断方法论库",
    title: "商业诊断方法论",
    fileCandidates: [
      path.resolve(process.cwd(), "../../docs/methodologies/business-diagnosis-methodology-core.md"),
      path.resolve(process.cwd(), "../../docs/business-diagnosis-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/methodologies/business-diagnosis-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/business-diagnosis-methodology-core.md"),
    ],
    displayFilePath: "mingyuan/docs/methodologies/business-diagnosis-methodology-core.md",
  },
  event_storytelling: {
    key: "event_storytelling",
    blockTitle: "事件内容化方法论库",
    title: "事件内容化方法论",
    fileCandidates: [
      path.resolve(process.cwd(), "../../docs/methodologies/event-storytelling-methodology-core.md"),
      path.resolve(process.cwd(), "../../docs/event-storytelling-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/methodologies/event-storytelling-methodology-core.md"),
      path.resolve(process.cwd(), "mingyuan/docs/event-storytelling-methodology-core.md"),
    ],
    displayFilePath: "mingyuan/docs/methodologies/event-storytelling-methodology-core.md",
  },
}

/** 缓存条目：内容 + 版本号。版本号变更即视为失效。 */
interface CacheEntry {
  content: string
  version: number
}

const cache = new Map<MethodologyKey, CacheEntry>()
/** 全局版本计数器。后台 PUT 时 bump，使所有缓存条目失效。 */
let globalVersion = 0

/** 读取文件原文（兜底），返回 null 表示所有候选路径都读不到。 */
async function readMethodologyFile(meta: MethodologyMeta): Promise<string | null> {
  for (const file of meta.fileCandidates) {
    try {
      const content = await readFile(file, "utf8")
      return content.trim()
    } catch {
      // 两种部署 cwd 形态，缺一个试下一个
    }
  }
  return null
}

/**
 * 取方法论文本（已包装好块标题，可直接拼进提示词）。
 * 优先 DB，无则读文件并回填播种到 DB。
 */
/**
 * @description 获取methodologyblock
 * @param key - 键
 * @returns Promise<string>
 */
export async function getMethodologyBlock(key: MethodologyKey): Promise<string> {
  const meta = METHODOLOGY_META[key]
  const cached = cache.get(key)

  // 命中且版本号匹配 → 直接返回
  if (cached && cached.version === globalVersion) {
    return cached.content
  }

  // DB 优先
  let rawContent: string | null = null
  let source: "db" | "file" = "file"
  try {
    const row = await prisma.agentMethodology.findUnique({ where: { key } })
    if (row && row.content.trim()) {
      rawContent = row.content.trim()
      source = "db"
    }
  } catch {
    // DB 不可用时回退文件（不阻断生成）
  }

  // 文件兜底 + 首次播种
  if (rawContent === null) {
    rawContent = await readMethodologyFile(meta)
    if (rawContent !== null) {
      // 异步播种，不阻塞当前调用
      void seedMethodologyFromText(key, rawContent).catch(() => null)
    } else {
      rawContent = ""
    }
  }

  const content = rawContent ? `\n\n=== ${meta.blockTitle} ===\n${rawContent}\n` : ""
  cache.set(key, { content, version: globalVersion })
  void source // source 仅用于诊断，此处保留语义
  return content
}

/** 把文件原文写进 DB（首次加载时播种，便于后续编辑）。 */
async function seedMethodologyFromText(key: MethodologyKey, text: string): Promise<void> {
  const meta = METHODOLOGY_META[key]
  try {
    await prisma.agentMethodology.upsert({
      where: { key },
      create: { key, title: meta.title, content: text, filePath: meta.displayFilePath },
      update: {}, // 已存在则不覆盖用户编辑
    })
  } catch {
    // 播种失败不影响生成
  }
}

/**
 * 后台编辑：写入新内容并使缓存失效。
 * 返回更新后的行。供 API 调用。
 */
/**
 * @description 更新methodologycontent
 * @param key - 键
 * @param content - 内容
 * @param updatedBy? - updatedBy?
 * @returns 无返回值
 */
export async function updateMethodologyContent(
  key: MethodologyKey,
  content: string,
  updatedBy?: string
) {
  const meta = METHODOLOGY_META[key]
  const row = await prisma.agentMethodology.upsert({
    where: { key },
    create: {
      key,
      title: meta.title,
      content,
      filePath: meta.displayFilePath,
      updatedBy,
    },
    update: { content, updatedBy, title: meta.title },
  })
  // bump 版本号 → 下次 getMethodologyBlock 重新读 DB
  invalidateMethodologyCache()
  return row
}

/** 重置为文件原文：删除 DB 行，使加载器回退到文件。 */
/**
 * @description 重置methodologytotext
 * @param key - 键
 * @returns 无返回值
 */
export async function resetMethodologyToText(key: MethodologyKey) {
  try {
    await prisma.agentMethodology.delete({ where: { key } })
  } catch {
    // 不存在即视为已重置
  }
  invalidateMethodologyCache()
}

/** 使所有方法论缓存失效（版本号 bump）。 */
/**
 * @description invalidatemethodologycache
 * @returns 无返回值
 */
export function invalidateMethodologyCache() {
  globalVersion += 1
}

/** 读取一份方法论的元信息 + 当前内容 + 来源（供后台展示）。 */
/**
 * @description 获取methodologyforadmin
 * @param key - 键
 * @returns 无返回值
 */
export async function getMethodologyForAdmin(key: MethodologyKey) {
  const meta = METHODOLOGY_META[key]
  const row = await prisma.agentMethodology.findUnique({ where: { key } }).catch(() => null)

  if (row && row.content.trim()) {
    return {
      key,
      title: row.title || meta.title,
      content: row.content,
      source: "db" as const,
      filePath: meta.displayFilePath,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    }
  }

  const fileText = (await readMethodologyFile(meta)) ?? ""
  return {
    key,
    title: meta.title,
    content: fileText,
    source: "file" as const,
    filePath: meta.displayFilePath,
    updatedAt: null,
    updatedBy: null,
  }
}

/** 列出全部方法论（后台总览用）。 */
/**
 * @description 列出methodologiesforadmin
 * @returns 无返回值
 */
export async function listMethodologiesForAdmin() {
  const keys = Object.keys(METHODOLOGY_META) as MethodologyKey[]
  return Promise.all(keys.map((k) => getMethodologyForAdmin(k)))
}
