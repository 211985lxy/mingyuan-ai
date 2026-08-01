import { prisma } from "@/lib/prisma"
import {
  type ExtractedStructure,
  structureToBlueprint,
} from "@/lib/aim/script-structure-extractor"
import type { GeneratedScript } from "@/lib/aim/script-structure-generator"
import { SCRIPT_DELIMITER } from "@/lib/aim/script-structure-extractor"

// ─── 类型定义 ──────────────────────────────────────────────

/** VideoStructure 行的精简序列化结构（API 返回用）。 */
export interface ScriptStructureRecord {
  id: string
  name: string
  displayName: string
  description: string | null
  blueprint: unknown
  origin: string
  sourceScriptsCount: number
  userId: string | null
  projectId: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface SaveExtractedStructureInput {
  structure: ExtractedStructure
  /** 原始文案数组（用于 sourceScriptText 追溯） */
  sourceScripts: string[]
  userId: string
  projectId?: string
}

// ─── 序列化 ────────────────────────────────────────────────

function toRecord(row: {
  id: string
  name: string
  displayName: string
  description: string | null
  blueprint: unknown
  origin: string
  sourceScriptsCount: number
  userId: string | null
  projectId: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}): ScriptStructureRecord {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    blueprint: row.blueprint,
    origin: row.origin,
    sourceScriptsCount: row.sourceScriptsCount,
    userId: row.userId,
    projectId: row.projectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ─── name 唯一性处理 ───────────────────────────────────────

/** VideoStructure.name 是唯一字段。提取结构的 name 可能与已有冲突，
 *  这里追加随机后缀保证唯一性。 */
function ensureUniqueName(base: string, attempt = 0): string {
  const safe = base.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_").slice(0, 40) || "extracted"
  if (attempt === 0) return safe
  return `${safe}_${attempt}`
}

// ─── 对外入口：提取结构 CRUD ───────────────────────────────

/** 保存提取的结构模板到 VideoStructure 表。
 *  - origin = "extracted"
 *  - status = "published"（立即可用）
 *  - name 冲突时自动追加后缀 */
export async function saveExtractedStructure(
  input: SaveExtractedStructureInput,
): Promise<ScriptStructureRecord> {
  const { structure, sourceScripts, userId, projectId } = input
  const blueprint = structureToBlueprint(structure)
  const sourceScriptText = sourceScripts.join(SCRIPT_DELIMITER)

  // name 唯一性：最多重试 5 次
  let attempt = 0
  let saved: Awaited<ReturnType<typeof createStructureRow>> | null = null
  while (attempt < 5 && !saved) {
    const name = ensureUniqueName(structure.name, attempt)
    try {
      saved = await createStructureRow({
        name,
        displayName: structure.displayName,
        description: structure.description,
        blueprint,
        sourceScriptText,
        sourceScriptsCount: sourceScripts.length,
        userId,
        projectId: projectId ?? null,
      })
    } catch (err) {
      // P2002 = unique constraint violation
      if (isUniqueViolation(err) && attempt < 4) {
        attempt += 1
        continue
      }
      throw err
    }
  }
  if (!saved) throw new Error("结构模板保存失败：name 唯一性冲突")
  return saved
}

async function createStructureRow(args: {
  name: string
  displayName: string
  description: string
  blueprint: unknown
  sourceScriptText: string
  sourceScriptsCount: number
  userId: string
  projectId: string | null
}): Promise<ScriptStructureRecord> {
  const row = await prisma.videoStructure.create({
    data: {
      name: args.name,
      displayName: args.displayName,
      description: args.description,
      useCase: "extracted",
      blueprint: args.blueprint as never,
      sortOrder: 1000,
      status: "published",
      origin: "extracted",
      sourceScriptText: args.sourceScriptText,
      sourceScriptsCount: args.sourceScriptsCount,
      userId: args.userId,
      projectId: args.projectId,
    },
  })
  return toRecord(row)
}

/** 列出用户已提取的结构模板。
 *  - 只返回 origin=extracted 且 status=published
 *  - 按 createdAt 倒序
 *  - projectId 匹配：同 projectId 或 projectId 为 null（全局） */
export async function listExtractedStructures(
  userId: string,
  projectId?: string,
  limit = 50,
): Promise<ScriptStructureRecord[]> {
  const rows = await prisma.videoStructure.findMany({
    where: {
      origin: "extracted",
      status: "published",
      userId,
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
  })
  return rows.map(toRecord)
}

/** 获取单个结构模板（canonical 或 extracted 都可）。 */
export async function getStructure(
  id: string,
  userId?: string,
): Promise<ScriptStructureRecord | null> {
  const row = await prisma.videoStructure.findUnique({ where: { id } })
  if (!row) return null
  // extracted 结构校验归属；canonical 结构公开可读
  if (row.origin === "extracted" && userId && row.userId !== userId) {
    return null
  }
  return toRecord(row)
}

/** 删除结构模板（仅允许删除 origin=extracted 且归属当前用户的）。 */
export async function deleteExtractedStructure(
  id: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const row = await prisma.videoStructure.findUnique({ where: { id } })
  if (!row) return { ok: false }
  if (row.origin !== "extracted") return { ok: false }
  if (row.userId !== userId) return { ok: false }
  await prisma.videoStructure.delete({ where: { id } })
  return { ok: true }
}

// ─── 对外入口：生成文案持久化 ─────────────────────────────

/** 把生成文案批量写入 Script 表。
 *  - status = "draft"（待用户挑选）
 *  - structureId 关联到来源结构模板
 *  - 用事务整体提交：任一条失败则全部回滚，避免半途中断留下孤儿草稿 */
export async function saveGeneratedScripts(args: {
  scripts: GeneratedScript[]
  userId: string
  structureId: string
  projectId?: string
}): Promise<Array<{ id: string; title: string; content: string }>> {
  const { scripts, userId, structureId } = args
  return prisma.$transaction(async (tx) => {
    const created: Array<{ id: string; title: string; content: string }> = []
    for (const script of scripts) {
      const row = await tx.script.create({
        data: {
          userId,
          content: script.content,
          structureId,
          status: "draft",
          qualityMetadata: { title: script.title, segmentOrder: script.segmentOrder } as never,
        },
      })
      created.push({ id: row.id, title: script.title, content: script.content })
    }
    return created
  })
}

// ─── VideoStructure → ExtractedStructure 反序列化 ─────────

/** 从 VideoStructure.blueprint 还原出 ExtractedStructure，供生成器使用。 */
export function blueprintToStructure(record: ScriptStructureRecord): ExtractedStructure {
  const bp = (record.blueprint ?? {}) as Record<string, unknown>
  const segmentsRaw = Array.isArray(bp.segments) ? bp.segments : []
  const segments = segmentsRaw
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s, i) => ({
      type: (s.type as ExtractedStructure["segments"][number]["type"]) ?? "other",
      label: typeof s.label === "string" ? s.label : "未命名片段",
      instruction: typeof s.instruction === "string" ? s.instruction : "",
      example: typeof s.example === "string" ? s.example : "",
      order: Number.isFinite(s.order) ? Number(s.order) : i + 1,
    }))
  return {
    name: record.name,
    displayName: record.displayName,
    description: record.description ?? "",
    segments,
    openingPattern: typeof bp.openingPattern === "string" ? bp.openingPattern : "",
    narrativeBeats: Array.isArray(bp.narrativeBeats)
      ? (bp.narrativeBeats as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    evidenceSlots: Number.isFinite(bp.evidenceSlots) ? Number(bp.evidenceSlots) : 0,
    ctaSlot: typeof bp.ctaSlot === "string" ? bp.ctaSlot : "",
    durationRange: {
      min: 30,
      max: 120,
      ...(bp.durationRange && typeof bp.durationRange === "object"
        ? bp.durationRange as Record<string, unknown>
        : {}),
    },
    pace: (bp.pace === "fast" || bp.pace === "slow") ? bp.pace : "medium",
    evidenceDensity: (bp.evidenceDensity === "light" || bp.evidenceDensity === "dense") ? bp.evidenceDensity : "medium",
    ctaStyle: (["consult", "save", "buy", "follow", "comment"] as const).includes(bp.ctaStyle as never)
      ? (bp.ctaStyle as ExtractedStructure["ctaStyle"])
      : "consult",
  }
}

// ─── 错误判定 ─────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string }
  return e.code === "P2002"
}
