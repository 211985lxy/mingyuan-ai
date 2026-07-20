import { prisma } from "@/lib/prisma"
import { LLMClient } from "@/lib/llm/client"

// ─── 类型 ──────────────────────────────────────────────────

/**
 * 借鉴 Cognee 的 cognify 管道：把一条知识增量抽取成实体 + 关系三元组。
 * 本模块只负责「抽取 → 幂等持久化 → 检索补充召回」，不引入图数据库，
 * 实体/关系直接存在 MySQL 的 KnowledgeEntity / KnowledgeRelation 表里。
 */

export const ENTITY_TYPES = [
  "person", // 人物（创始人/老板/客户/KOL）
  "product", // 产品/服务/卖点载体
  "brand", // 品牌/公司
  "concept", // 行业概念/方法论/理念
  "pain", // 痛点/诉求
  "channel", // 渠道/平台/私域场景
  "audience", // 目标人群/用户画像
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const RELATION_TYPES = [
  "sells", // A 卖 B（人物/品牌 → 产品）
  "targets", // A 面向 B（产品/品牌 → 人群/痛点）
  "mentions", // A 提及 B（泛化关联）
  "solves", // A 解决 B（产品/方案 → 痛点）
  "competes_with", // A 竞争 B
  "part_of", // A 属于 B（产品 → 品牌，子概念 → 概念）
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

export interface ExtractedEntity {
  name: string
  type: EntityType
  aliases?: string[]
}

export interface ExtractedRelation {
  from: string // 实体名（对应 fromEntity.name）
  to: string // 实体名（对应 toEntity.name）
  type: RelationType
  evidence?: string
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
}

// ─── 1. Prompt 构造（纯函数，可单测） ──────────────────────

const SYSTEM_PROMPT = `你是知识图谱抽取器。从给定的企业知识文本中抽取「实体」和「实体间关系」，用于构建可检索的知识图谱。

抽取规则：
1. 只抽取明确出现、对 IP 营销有价值的实体，不要凭空臆造。
2. 实体名归一化（同一对象只保留一个标准名，其余作为 aliases）。
3. 关系只保留语义明确的三元组，模糊的不抽。

实体类型（type）取值之一：
- person（人物：创始人/老板/客户/KOL）
- product（产品/服务/卖点载体）
- brand（品牌/公司）
- concept（行业概念/方法论/理念）
- pain（痛点/诉求）
- channel（渠道/平台/私域场景）
- audience（目标人群/用户画像）

关系类型（type）取值之一：
- sells（A 卖 B）
- targets（A 面向 B）
- mentions（A 提及 B，泛化关联）
- solves（A 解决 B）
- competes_with（A 竞争 B）
- part_of（A 属于 B）

输出纯 JSON（不要 markdown 代码块），结构如下：
{"entities":[{"name":"标准名","type":"person","aliases":["别名1"]},{"name":"美白精华","type":"product"}],"relations":[{"from":"创始人老王","to":"美白精华","type":"sells","evidence":"老王直播间主推美白精华"}]}

注意：
- relations 里的 from/to 必须出现在 entities 的 name 中。
- 实体名长度 2-30 字，过短或过长的不要抽。
- 一条知识通常抽取 1-8 个实体，0-6 条关系即可，宁缺毋滥。`

/**
 * 构造实体抽取 prompt（纯函数）。
 */
/**
 * @description 构建extractionprompt
 * @param content - 内容
 * @returns 无返回值
 */
export function buildExtractionPrompt(content: string): { system: string; user: string } {
  const trimmed = content.slice(0, 3000)
  return {
    system: SYSTEM_PROMPT,
    user: `请抽取以下知识文本中的实体与关系：\n\n${trimmed}`,
  }
}

// ─── 2. JSON 解析与清洗（纯函数，可单测） ──────────────────

function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v)
}

function isRelationType(v: unknown): v is RelationType {
  return typeof v === "string" && (RELATION_TYPES as readonly string[]).includes(v)
}

function cleanName(name: unknown): string {
  if (typeof name !== "string") return ""
  const n = name.trim()
  // 去除首尾标点/空白，限制长度
  return n.replace(/^[\s【\[（(]+|[\s】\]）).,，。!！?？;；]+$/g, "").slice(0, 30)
}

/**
 * 解析 LLM 输出为结构化抽取结果（纯函数，对畸形输入容错）。
 * - 接受裸数组 或 {entities,relations} 或 {items} 包装。
 * - 丢弃非法实体/关系；relations 中引用了不存在实体的会被丢弃。
 */
/**
 * @description 解析extractionresult
 * @param raw - 原始数据
 * @returns ExtractionResult
 */
export function parseExtractionResult(raw: string): ExtractionResult {
  const empty: ExtractionResult = { entities: [], relations: [] }
  if (!raw || typeof raw !== "string") return empty

  let text = raw.trim()
  // 剥离可能的 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // 尝试从文本里抢救第一个 JSON 对象/数组
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (!match) return empty
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return empty
    }
  }

  const entitiesRaw = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.entities)
      ? (parsed as Record<string, unknown>).entities
      : Array.isArray((parsed as Record<string, unknown>)?.items)
        ? (parsed as Record<string, unknown>).items
        : []
  const relationsRaw =
    !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>)?.relations)
      ? (parsed as Record<string, unknown>).relations
      : []

  const entities: ExtractedEntity[] = []
  const seen = new Set<string>()
  for (const e of entitiesRaw as unknown[]) {
    if (!e || typeof e !== "object") continue
    const obj = e as Record<string, unknown>
    const name = cleanName(obj.name)
    if (!name) continue
    if (!isEntityType(obj.type)) continue
    const key = `${name}|${obj.type}`
    if (seen.has(key)) continue
    seen.add(key)
    const aliases = Array.isArray(obj.aliases)
      ? obj.aliases.map((a) => cleanName(a)).filter(Boolean).slice(0, 5)
      : []
    entities.push({ name, type: obj.type, aliases })
  }

  const entityNames = new Set(entities.map((e) => e.name))
  const relations: ExtractedRelation[] = []
  const relSeen = new Set<string>()
  for (const r of relationsRaw as unknown[]) {
    if (!r || typeof r !== "object") continue
    const obj = r as Record<string, unknown>
    const from = cleanName(obj.from)
    const to = cleanName(obj.to)
    if (!from || !to || from === to) continue
    if (!entityNames.has(from) || !entityNames.has(to)) continue
    if (!isRelationType(obj.type)) continue
    const key = `${from}|${to}|${obj.type}`
    if (relSeen.has(key)) continue
    relSeen.add(key)
    const evidence =
      typeof obj.evidence === "string" && obj.evidence.trim()
        ? obj.evidence.trim().slice(0, 200)
        : undefined
    relations.push({ from, to, type: obj.type, evidence })
  }

  return { entities, relations }
}

// ─── 3. LLM 抽取（带降级） ─────────────────────────────────

/**
 * 调用 LLM 抽取实体与关系。失败返回空结果（不抛错），供 fire-and-forget 使用。
 */
/**
 * @description 提取entities
 * @param content - 内容
 * @returns Promise<ExtractionResult>
 */
export async function extractEntities(content: string): Promise<ExtractionResult> {
  const trimmed = content.trim()
  if (trimmed.length < 8) return { entities: [], relations: [] }

  const llm = LLMClient.shared()
  const prompt = buildExtractionPrompt(trimmed)
  try {
    const result = await llm.complete({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
    })
    return parseExtractionResult(result.content)
  } catch (error) {
    console.warn("[entity-extract] extraction failed:", error)
    return { entities: [], relations: [] }
  }
}

// ─── 4. 幂等持久化 ─────────────────────────────────────────

interface PersistContext {
  userId: string
  projectId?: string | null
}

/**
 * 把抽取结果幂等写入 KnowledgeEntity / KnowledgeRelation。
 * - 同 userId+projectId+name+type 的实体归并，aliases 合并去重。
 * - entryId 变化时先清理该 entry 旧的 relation（内容已变，重新抽取）。
 * - 全程容错，失败只 warn 不抛。
 */
/**
 * @description persistentitiesandrelations
 * @param entryId - 条目唯一标识符
 * @param extracted - extracted
 * @param ctx - 上下文
 * @returns Promise<void>
 */
export async function persistEntitiesAndRelations(
  entryId: string,
  extracted: ExtractionResult,
  ctx: PersistContext,
): Promise<void> {
  const { entities, relations } = extracted
  if (entities.length === 0 && relations.length === 0) return
  try {
    // 内容变化时先清掉该 entry 旧关系，避免残留过期三元组
    await prisma.knowledgeRelation.deleteMany({ where: { entryId } })
  } catch (error) {
    console.warn("[entity-extract] cleanup old relations failed:", error)
  }

  // 实体 upsert：归并到已有实体，aliases 合并
  const entityIdByName = new Map<string, string>()
  for (const e of entities) {
    try {
      const existing = await prisma.knowledgeEntity.findFirst({
        where: {
          userId: ctx.userId,
          projectId: ctx.projectId ?? null,
          name: e.name,
          type: e.type,
        },
        select: { id: true, aliases: true },
      })
      if (existing) {
        const prevAliases = Array.isArray(existing.aliases)
          ? (existing.aliases as unknown[]).filter((a): a is string => typeof a === "string")
          : []
        const merged = Array.from(new Set([...prevAliases, ...(e.aliases ?? [])]))
        await prisma.knowledgeEntity.update({
          where: { id: existing.id },
          data: { aliases: merged, status: "active" },
        })
        entityIdByName.set(e.name, existing.id)
      } else {
        const created = await prisma.knowledgeEntity.create({
          data: {
            userId: ctx.userId,
            projectId: ctx.projectId ?? null,
            name: e.name,
            type: e.type,
            aliases: e.aliases ?? [],
            status: "active",
          },
        })
        entityIdByName.set(e.name, created.id)
      }
    } catch (error) {
      console.warn(`[entity-extract] persist entity "${e.name}" failed:`, error)
    }
  }

  // 关系 upsert：依赖实体 id，幂等去重
  for (const r of relations) {
    const fromId = entityIdByName.get(r.from)
    const toId = entityIdByName.get(r.to)
    if (!fromId || !toId) continue
    try {
      await prisma.knowledgeRelation.upsert({
        where: {
          fromEntityId_toEntityId_entryId_type: {
            fromEntityId: fromId,
            toEntityId: toId,
            entryId,
            type: r.type,
          },
        },
        create: { fromEntityId: fromId, toEntityId: toId, entryId, type: r.type, evidence: r.evidence },
        update: { evidence: r.evidence },
      })
    } catch (error) {
      console.warn(`[entity-extract] persist relation "${r.from}->${r.to}" failed:`, error)
    }
  }
}

/**
 * 入口：抽取 + 持久化一条知识。供路由层 fire-and-forget 调用。
 */
/**
 * @description 提取andpersistforentry
 * @param entryId - 条目唯一标识符
 * @param content - 内容
 * @param ctx - 上下文
 * @returns Promise<void>
 */
export async function extractAndPersistForEntry(
  entryId: string,
  content: string,
  ctx: PersistContext,
): Promise<void> {
  const extracted = await extractEntities(content)
  await persistEntitiesAndRelations(entryId, extracted, ctx)
}

// ─── 5. 检索补充召回 ───────────────────────────────────────

export interface EntityContextEntry {
  id: string
  title: string
  content: string
  category: string
  tags: unknown
  valueGrade: string | null
  score: number
}

/**
 * 按查询文本命中实体，反向找出关联的知识条目。
 * 作为向量检索的「补充召回」，不替换向量 topK。
 * 实现：把 query 切词，匹配实体名/别名，取命中实体的关系对端的 entryId。
 */
/**
 * @description retrieveentitycontext
 * @param input - 输入数据
 * @returns Promise<EntityContextEntry[]>
 */
export async function retrieveEntityContext(input: {
  projectId?: string | null
  query: string
  topK?: number
}): Promise<EntityContextEntry[]> {
  const { projectId, query } = input
  const topK = input.topK ?? 4
  if (!query.trim()) return []

  // 抽取查询中的候选关键词（中文按字数过滤，>=2 字）
  const tokens = query
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 12)
  if (tokens.length === 0) return []

  try {
    const entities = await prisma.knowledgeEntity.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        status: "active",
        OR: tokens.flatMap((t) => [
          { name: { contains: t } },
          // JSON contains 在 MariaDB 上对字符串数组可行
          { aliases: { string_contains: t } },
        ]),
      },
      select: { id: true, name: true },
      take: 30,
    })
    if (entities.length === 0) return []

    const entityIds = entities.map((e) => e.id)
    // 通过关系找出关联的 entryId（去重）
    const relations = await prisma.knowledgeRelation.findMany({
      where: { OR: [{ fromEntityId: { in: entityIds } }, { toEntityId: { in: entityIds } }] },
      select: { entryId: true },
      take: 60,
      distinct: ["entryId"],
    })
    const entryIds = Array.from(new Set(relations.map((r) => r.entryId))).slice(0, topK * 2)
    if (entryIds.length === 0) return []

    const entries = await prisma.knowledgeEntry.findMany({
      where: { id: { in: entryIds }, status: "active" },
      select: { id: true, title: true, content: true, category: true, tags: true, valueGrade: true },
      take: 100,
    })
    return entries.map((e) => ({
      id: e.id,
      title: e.title,
      content: e.content,
      category: e.category,
      tags: e.tags,
      valueGrade: e.valueGrade,
      score: 0.5, // 补充召回，固定基线分，由上层重排决定最终位置
    }))
  } catch (error) {
    console.warn("[entity-extract] retrieveEntityContext failed:", error)
    return []
  }
}
