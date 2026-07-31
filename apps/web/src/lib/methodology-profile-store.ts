/**
 * 命名方法论统一加载层（ADR-002）。
 *
 * 三入口（generate / chat / scripts）共用本模块，禁止任何入口自行查
 * MethodologyProfileVersion 或写名称匹配 —— 这是保证三入口行为一致的唯一关口。
 *
 * 设计要点（与 AgentMethodology 系统方法论区分）：
 *  - 按 profileId / versionId 直读，不依赖向量召回。
 *  - 路由规则：显式 ID > 文本精确命中 name/aliases > none（MVP 不做 LLM 模糊猜测）。
 *  - 只加载 published 版本；draft 不参与。
 *  - scope=user 的私有方法论必须校验所属用户，跨用户越权抛明确错误。
 *  - 功能开关 AIM_NAMED_METHODOLOGY_ENABLED 关闭时整体短路为 none，恢复当前行为。
 *
 * 返回的 policy 结构会被冻结进 AimRunSpec.methodologyPolicy（保证可重放），
 * versionRows 用于装配上下文块 + 写入 contextManifest。
 */

import { prisma } from "@/lib/prisma"
import { env } from "@/env"
import { sha256 } from "@/lib/aim-harness/hashing"

/** 可见 active 方法论的加载上限：配置型集合，超出视为异常。 */
const METHODOLOGY_PROFILE_LIMIT = 200

/** 功能开关：关闭时忽略 methodologyProfileIds，恢复当前上下文（不注入命名方法论）。 */
export function isNamedMethodologyEnabled(): boolean {
  return env.AIM_NAMED_METHODOLOGY_ENABLED === "true"
}

/** 方法论决策来源（冻结进 spec 的 source 字段）。 */
export type MethodologySelectionSource = "explicit_parameter" | "explicit_text" | "none"

/** 冻结后的单条方法论决策（profile + 命中的 published 版本）。 */
export interface ResolvedMethodologySelection {
  profileId: string
  versionId: string
  version: number
  mode: "primary"
  reason: string
}

/** resolveMethodologyPolicy 的产出：决策来源 + 命中明细 + 可装配的版本行。 */
export interface MethodologyPolicy {
  source: MethodologySelectionSource
  selections: ResolvedMethodologySelection[]
  /** 命中的 published 版本行（含 compiledPrompt），供 buildMethodologyProfileBlock 装配。 */
  versionRows: MethodologyVersionRow[]
}

export interface MethodologyVersionRow {
  versionId: string
  profileId: string
  version: number
  compiledPrompt: string
  checksum: string
  updatedAt: string
}

/** resolveMethodologyPolicy 入参。 */
export interface ResolveMethodologyPolicyInput {
  /** 执行者 userId（用于 scope=user 私有方法论的归属校验；可空表示匿名/无权）。 */
  userId?: string
  /** 前端/API 显式选择的 profile id 列表。MVP 只取第一个。 */
  methodologyProfileIds?: string[]
  /** 用户原始输入文本（用于文本精确命中 name/aliases）。 */
  rawInput?: string
  /** 生成入口透传：content_producer 默认兜底加载徐沪生 Profile（MVP 硬编码 slug）；其他入口不传则不兜底。 */
  agentId?: string
}

/** content_producer 默认兜底方法论的 slug（MVP 写死；后续可迁到 env 或 配置表）。 */
const CONTENT_PRODUCER_DEFAULT_PROFILE_SLUG = "xuhusheng-content-creation"

const EMPTY_POLICY: MethodologyPolicy = {
  source: "none",
  selections: [],
  versionRows: [],
}

/** MVP 限制：最多 1 个主方法论。 */
const MAX_PROFILES = 1

/**
 * 解析本次运行的命名方法论策略。路由顺序：
 *   显式 methodologyProfileIds > 文本精确命中 name/aliases > none
 *
 * - 不存在 / 无权限的显式 ID → 抛错（让调用方返回明确错误，而非静默忽略）。
 * - 显式 ID 命中 archived profile 或无 published 版本 → 抛错。
 * - 文本匹配只做精确命中，命中 archived 或无 published 版本则视为未命中（不抛错）。
 */
export async function resolveMethodologyPolicy(
  input: ResolveMethodologyPolicyInput,
): Promise<MethodologyPolicy> {
  if (!isNamedMethodologyEnabled()) return EMPTY_POLICY

  const { userId, methodologyProfileIds, rawInput } = input

  // 1. 显式 ID 优先
  if (methodologyProfileIds && methodologyProfileIds.length > 0) {
    const ids = methodologyProfileIds.slice(0, MAX_PROFILES)
    const resolved = await resolveByIds(ids, userId)
    // resolveByIds 在缺失/无权/无 published 版本时抛错，这里直接返回
    return {
      source: "explicit_parameter",
      selections: resolved.map((r) => ({
        profileId: r.profileId,
        versionId: r.versionId,
        version: r.version,
        mode: "primary" as const,
        reason: "explicit_parameter",
      })),
      versionRows: resolved,
    }
  }

  // 2. 文本精确命中 name/aliases（MVP 不做模糊语义匹配）
  if (rawInput && rawInput.trim()) {
    const resolved = await resolveByText(rawInput, userId)
    if (resolved.length > 0) {
      return {
        source: "explicit_text",
        selections: resolved.map((r) => ({
          profileId: r.profileId,
          versionId: r.versionId,
          version: r.version,
          mode: "primary" as const,
          reason: "explicit_text",
        })),
        versionRows: resolved,
      }
    }
  }

  // 3. 不选择：但 content_producer 入口默认兜底「徐沪生创作方法论」
  if (
    input.agentId === "content_producer" &&
    !input.methodologyProfileIds?.length &&
    CONTENT_PRODUCER_DEFAULT_PROFILE_SLUG
  ) {
    const resolved = await resolveBySlug(CONTENT_PRODUCER_DEFAULT_PROFILE_SLUG, userId)
    if (resolved.length > 0) {
      return {
        source: "explicit_text",
        selections: resolved.map((r) => ({
          profileId: r.profileId,
          versionId: r.versionId,
          version: r.version,
          mode: "primary" as const,
          reason: "content_producer_default_profile_slug",
        })),
        versionRows: resolved,
      }
    }
  }

  return EMPTY_POLICY
}

/** 按 profileId 直读，校验归属 + published 版本。缺失/无权/无版本抛错。 */
async function resolveByIds(
  profileIds: string[],
  userId?: string,
): Promise<MethodologyVersionRow[]> {
  const rows: MethodologyVersionRow[] = []
  for (const profileId of profileIds) {
    const profile = await prisma.methodologyProfile.findUnique({
      where: { id: profileId },
      select: { id: true, userId: true, scope: true, status: true },
    })
    if (!profile) {
      throw new MethodologyProfileError(`方法论不存在：${profileId}`)
    }
    // scope=user 必须归属当前用户；全局方法论（scope=global / userId=null）所有人可见
    if (profile.scope === "user" && profile.userId && profile.userId !== userId) {
      throw new MethodologyProfileError(`无权访问该方法论：${profileId}`)
    }
    if (profile.status === "archived") {
      throw new MethodologyProfileError(`该方法论已归档：${profileId}`)
    }
    const version = await getPublishedVersion(profileId)
    if (!version) {
      throw new MethodologyProfileError(`该方法论暂无可用的已发布版本：${profileId}`)
    }
    rows.push(version)
  }
  return rows
}

/** 文本精确命中 name 或 aliases。只取第一个命中，且需有 published 版本。 */
async function resolveByText(
  rawInput: string,
  userId?: string,
): Promise<MethodologyVersionRow[]> {
  // 仅 active + 可见（全局或本人私有）的方法论参与匹配
  const candidates = await prisma.methodologyProfile.findMany({
    where: {
      status: "active",
      OR: [
        { scope: "global" },
        { scope: "user", userId: userId ?? null },
      ],
    },
    orderBy: { name: "asc" },
    take: METHODOLOGY_PROFILE_LIMIT,
    select: { id: true, name: true, aliases: true },
  })

  for (const candidate of candidates) {
    const names = collectMatchNames(candidate.name, candidate.aliases)
    const hit = names.some((name) => rawInput.includes(name))
    if (hit) {
      const version = await getPublishedVersion(candidate.id)
      if (version) return [version]
      // 命中 name 但无 published 版本 → 视为未命中，继续
    }
  }
  return []
}

/** 按 slug 命中全局或本人可见的 Profile，取 published 版本。MVP 仅用于 content_producer 默认兜底。 */
async function resolveBySlug(
  slug: string,
  userId?: string,
): Promise<MethodologyVersionRow[]> {
  const profile = await prisma.methodologyProfile.findUnique({
    where: { slug },
    select: { id: true, userId: true, scope: true, status: true },
  })
  if (!profile) return []
  if (profile.status !== "active") return []
  // 全局方法论（scope=global 或 userId=null）所有人可见；私有需归属匹配
  const isVisible =
    profile.scope === "global" ||
    profile.userId === null ||
    (profile.scope === "user" && profile.userId && profile.userId === userId)
  if (!isVisible) return []
  const version = await getPublishedVersion(profile.id)
  return version ? [version] : []
}

/** 收集精确匹配名称集合（name + aliases，去空白、去重、过滤过短的）。 */
function collectMatchNames(name: string, aliasesRaw: unknown): string[] {
  const names = [name]
  if (Array.isArray(aliasesRaw)) {
    for (const alias of aliasesRaw) {
      if (typeof alias === "string") names.push(alias)
    }
  }
  return Array.from(new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2)))
}

/** 取某 profile 最新的 published 版本（按 version 降序取第一条）。 */
export async function getPublishedVersion(profileId: string): Promise<MethodologyVersionRow | null> {
  const row = await prisma.methodologyProfileVersion.findFirst({
    where: { profileId, status: "published" },
    orderBy: { version: "desc" },
    select: {
      id: true,
      profileId: true,
      version: true,
      compiledPrompt: true,
      checksum: true,
      createdAt: true,
      publishedAt: true,
    },
  })
  if (!row) return null
  return {
    versionId: row.id,
    profileId: row.profileId,
    version: row.version,
    compiledPrompt: row.compiledPrompt,
    checksum: row.checksum || sha256(row.compiledPrompt),
    updatedAt: (row.publishedAt ?? row.createdAt).toISOString(),
  }
}

/** 按 version 行 id 精确读版本（不依赖召回）。缺失/无权/非 published 抛错。 */
export async function getMethodologyProfileVersion(
  versionId: string,
  userId?: string,
): Promise<MethodologyVersionRow> {
  const row = await prisma.methodologyProfileVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      profileId: true,
      version: true,
      compiledPrompt: true,
      checksum: true,
      createdAt: true,
      publishedAt: true,
      status: true,
      profile: { select: { userId: true, scope: true, status: true } },
    },
  })
  if (!row) throw new MethodologyProfileError(`版本不存在：${versionId}`)
  if (row.profile.status === "archived") {
    throw new MethodologyProfileError(`该方法论已归档`)
  }
  if (row.profile.scope === "user" && row.profile.userId && row.profile.userId !== userId) {
    throw new MethodologyProfileError(`无权访问该方法论`)
  }
  if (row.status !== "published") {
    throw new MethodologyProfileError(`该版本未发布：${versionId}`)
  }
  return {
    versionId: row.id,
    profileId: row.profileId,
    version: row.version,
    compiledPrompt: row.compiledPrompt,
    checksum: row.checksum || sha256(row.compiledPrompt),
    updatedAt: (row.publishedAt ?? row.createdAt).toISOString(),
  }
}

/**
 * 把 policy 装配成可进 prompt 的 block（带来源边界 + 事实优先级声明）。
 *
 * 边界规则（ADR-002 优先级）：借鉴方法与框架，不模仿作者身份与语言口吻；
 * 方法论中的人物/业务/产品案例不得覆盖客户资料。
 */
export function buildMethodologyProfileBlock(policy: MethodologyPolicy): string {
  if (policy.versionRows.length === 0) return ""
  const sections: string[] = [
    "=== 本次指定方法论（强参考） ===",
    "使用方式：必须按该方法论的结构、钩子、判断标准与写作规范执行；借鉴框架，不要模仿作者的身份、立场与语言口吻。",
    "事实优先级：本方法论中的任何人物、业务、产品案例与假设，均不得覆盖或替换当前项目的真实资料与用户本次的明确要求。",
    "",
  ]
  for (const row of policy.versionRows) {
    sections.push(
      `方法论版本：v${row.version}（checksum: ${row.checksum.slice(0, 12)}…）`,
      "",
      row.compiledPrompt.trim(),
      "",
    )
  }
  return `\n${sections.join("\n")}\n`
}

/** 自定义错误类型，便于三入口区分「方法论解析失败」与其它错误。 */
export class MethodologyProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MethodologyProfileError"
  }
}

/** 列表项（前端选择器用）：profile 摘要 + 最新 published 版本号。 */
export interface MethodologyProfileSummary {
  id: string
  name: string
  originatorName: string | null
  description: string | null
  scope: string
  latestVersion: number | null
  updatedAt: string
}

/** 列出可见的 active 方法论（全局 + 本人私有），含最新 published 版本号。 */
export async function listMethodologyProfiles(userId: string): Promise<MethodologyProfileSummary[]> {
  const profiles = await prisma.methodologyProfile.findMany({
    where: {
      status: "active",
      OR: [{ scope: "global" }, { scope: "user", userId }],
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: METHODOLOGY_PROFILE_LIMIT,
    select: {
      id: true,
      name: true,
      originatorName: true,
      description: true,
      scope: true,
      updatedAt: true,
      versions: {
        where: { status: "published" },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true },
      },
    },
  })
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    originatorName: p.originatorName,
    description: p.description,
    scope: p.scope,
    latestVersion: p.versions[0]?.version ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }))
}

/** 详情（含最新 published 版本的 compiledPrompt 与 checksum）。无权/不存在/无版本返回 null。 */
export async function getMethodologyProfileDetail(
  profileId: string,
  userId: string,
): Promise<{
  id: string
  name: string
  originatorName: string | null
  aliases: string[]
  description: string | null
  scope: string
  methodologyType: string
  applicableAgents: string[]
  version: number
  compiledPrompt: string
  checksum: string
  updatedAt: string
} | null> {
  const profile = await prisma.methodologyProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      name: true,
      originatorName: true,
      aliases: true,
      description: true,
      scope: true,
      methodologyType: true,
      applicableAgents: true,
      userId: true,
      status: true,
    },
  })
  if (!profile || profile.status !== "active") return null
  if (profile.scope === "user" && profile.userId && profile.userId !== userId) return null
  const version = await getPublishedVersion(profileId)
  if (!version) return null
  return {
    id: profile.id,
    name: profile.name,
    originatorName: profile.originatorName,
    aliases: Array.isArray(profile.aliases) ? (profile.aliases as string[]) : [],
    description: profile.description,
    scope: profile.scope,
    methodologyType: profile.methodologyType,
    applicableAgents: Array.isArray(profile.applicableAgents) ? (profile.applicableAgents as string[]) : [],
    version: version.version,
    compiledPrompt: version.compiledPrompt,
    checksum: version.checksum,
    updatedAt: version.updatedAt,
  }
}
