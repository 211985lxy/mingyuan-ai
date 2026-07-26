/**
 * 命名方法论后台管理（ADR-002）。
 * 与 methodology-profile-store 分离：生成链路只读 store，后台写操作走本模块。
 */

import { prisma } from "@/lib/prisma"
import { sha256 } from "@/lib/aim-harness/hashing"
import { MethodologyProfileError } from "@/lib/methodology-profile-store"

const METHODOLOGY_PROFILE_LIMIT = 200

/** 后台列表项：含最新 published / draft 版本摘要。 */
export interface MethodologyProfileAdminListItem {
  id: string
  name: string
  slug: string
  originatorName: string | null
  aliases: string[]
  description: string | null
  scope: string
  status: string
  methodologyType: string
  applicableAgents: string[]
  priority: number
  latestPublishedVersion: number | null
  latestDraftVersion: number | null
  updatedAt: string
}

/** 后台列出全部方法论（含 archived），不受功能开关影响。 */
export async function listMethodologyProfilesForAdmin(): Promise<MethodologyProfileAdminListItem[]> {
  const profiles = await prisma.methodologyProfile.findMany({
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: METHODOLOGY_PROFILE_LIMIT,
    select: {
      id: true,
      name: true,
      slug: true,
      originatorName: true,
      aliases: true,
      description: true,
      scope: true,
      status: true,
      methodologyType: true,
      applicableAgents: true,
      priority: true,
      updatedAt: true,
      versions: {
        orderBy: { version: "desc" },
        take: 20,
        select: { version: true, status: true },
      },
    },
  })
  return profiles.map((p) => {
    const published = p.versions.find((v) => v.status === "published")
    const draft = p.versions.find((v) => v.status === "draft")
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      originatorName: p.originatorName,
      aliases: Array.isArray(p.aliases) ? (p.aliases as string[]) : [],
      description: p.description,
      scope: p.scope,
      status: p.status,
      methodologyType: p.methodologyType,
      applicableAgents: Array.isArray(p.applicableAgents) ? (p.applicableAgents as string[]) : [],
      priority: p.priority,
      latestPublishedVersion: published?.version ?? null,
      latestDraftVersion: draft?.version ?? null,
      updatedAt: p.updatedAt.toISOString(),
    }
  })
}

export interface MethodologyProfileAdminDetail {
  id: string
  name: string
  slug: string
  originatorName: string | null
  aliases: string[]
  description: string | null
  scope: string
  status: string
  methodologyType: string
  applicableAgents: string[]
  applicableTasks: string[]
  priority: number
  updatedAt: string
  versions: Array<{
    id: string
    version: number
    status: string
    checksum: string
    compiledPrompt: string
    contentMarkdown: string
    createdAt: string
    publishedAt: string | null
  }>
}

/** 后台详情：含全部版本（含 draft）。 */
export async function getMethodologyProfileAdminDetail(
  profileId: string,
): Promise<MethodologyProfileAdminDetail | null> {
  const profile = await prisma.methodologyProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      name: true,
      slug: true,
      originatorName: true,
      aliases: true,
      description: true,
      scope: true,
      status: true,
      methodologyType: true,
      applicableAgents: true,
      applicableTasks: true,
      priority: true,
      updatedAt: true,
      versions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          checksum: true,
          compiledPrompt: true,
          contentMarkdown: true,
          createdAt: true,
          publishedAt: true,
        },
      },
    },
  })
  if (!profile) return null
  return {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    originatorName: profile.originatorName,
    aliases: Array.isArray(profile.aliases) ? (profile.aliases as string[]) : [],
    description: profile.description,
    scope: profile.scope,
    status: profile.status,
    methodologyType: profile.methodologyType,
    applicableAgents: Array.isArray(profile.applicableAgents) ? (profile.applicableAgents as string[]) : [],
    applicableTasks: Array.isArray(profile.applicableTasks) ? (profile.applicableTasks as string[]) : [],
    priority: profile.priority,
    updatedAt: profile.updatedAt.toISOString(),
    versions: profile.versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      checksum: v.checksum || sha256(v.compiledPrompt),
      compiledPrompt: v.compiledPrompt,
      contentMarkdown: v.contentMarkdown,
      createdAt: v.createdAt.toISOString(),
      publishedAt: v.publishedAt?.toISOString() ?? null,
    })),
  }
}

export interface UpdateMethodologyProfileMetaInput {
  name?: string
  originatorName?: string | null
  aliases?: string[]
  description?: string | null
  applicableAgents?: string[]
  applicableTasks?: string[]
  priority?: number
  status?: "active" | "archived"
}

/** 更新方法论元信息（不改版本内容）。 */
export async function updateMethodologyProfileMeta(
  profileId: string,
  input: UpdateMethodologyProfileMetaInput,
) {
  const existing = await prisma.methodologyProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  })
  if (!existing) throw new MethodologyProfileError(`方法论不存在：${profileId}`)

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.originatorName !== undefined) data.originatorName = input.originatorName?.trim() || null
  if (input.aliases !== undefined) data.aliases = input.aliases.map((a) => a.trim()).filter((a) => a.length >= 2)
  if (input.description !== undefined) data.description = input.description?.trim() || null
  if (input.applicableAgents !== undefined) data.applicableAgents = input.applicableAgents
  if (input.applicableTasks !== undefined) data.applicableTasks = input.applicableTasks
  if (input.priority !== undefined) data.priority = input.priority
  if (input.status !== undefined) data.status = input.status

  return prisma.methodologyProfile.update({
    where: { id: profileId },
    data,
    select: { id: true, name: true, status: true, updatedAt: true },
  })
}

export interface CreateMethodologyProfileVersionInput {
  profileId: string
  compiledPrompt: string
  contentMarkdown?: string
  /** draft 仅后台可见；published 立刻进生成链路。 */
  status?: "draft" | "published"
}

/**
 * 新建版本（version+1）。旧版本保留，不可原地改。
 * checksum 与最新 published 相同且目标也是 published → 抛错提示无需新建。
 */
export async function createMethodologyProfileVersion(input: CreateMethodologyProfileVersionInput) {
  const compiledPrompt = input.compiledPrompt.trim()
  if (!compiledPrompt) throw new MethodologyProfileError("compiledPrompt 不能为空")
  if (compiledPrompt.length > 20_000) throw new MethodologyProfileError("compiledPrompt 过长（上限 20000 字）")

  const profile = await prisma.methodologyProfile.findUnique({
    where: { id: input.profileId },
    select: { id: true, status: true },
  })
  if (!profile) throw new MethodologyProfileError(`方法论不存在：${input.profileId}`)
  if (profile.status === "archived") throw new MethodologyProfileError("已归档方法论不可新建版本")

  const latest = await prisma.methodologyProfileVersion.findFirst({
    where: { profileId: input.profileId },
    orderBy: { version: "desc" },
    select: { version: true, checksum: true, status: true },
  })
  const checksum = sha256(compiledPrompt)
  const status = input.status === "draft" ? "draft" : "published"
  if (status === "published" && latest?.status === "published" && latest.checksum === checksum) {
    throw new MethodologyProfileError("内容未变化，无需发布新版本")
  }

  const nextVersion = (latest?.version ?? 0) + 1
  const contentMarkdown = input.contentMarkdown?.trim() || compiledPrompt
  return prisma.methodologyProfileVersion.create({
    data: {
      profileId: input.profileId,
      version: nextVersion,
      contentMarkdown,
      compiledPrompt,
      sourceRefs: [],
      checksum,
      status,
      publishedAt: status === "published" ? new Date() : null,
    },
    select: {
      id: true,
      profileId: true,
      version: true,
      status: true,
      checksum: true,
      publishedAt: true,
      createdAt: true,
    },
  })
}

/** 把 draft 版本发布为 published（不新建号；仅改状态）。已 published 直接返回。 */
export async function publishMethodologyProfileVersion(versionId: string) {
  const row = await prisma.methodologyProfileVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      profileId: true,
      version: true,
      status: true,
      checksum: true,
      profile: { select: { status: true } },
    },
  })
  if (!row) throw new MethodologyProfileError(`版本不存在：${versionId}`)
  if (row.profile.status === "archived") throw new MethodologyProfileError("已归档方法论不可发布版本")
  if (row.status === "published") {
    return { id: row.id, profileId: row.profileId, version: row.version, status: row.status, checksum: row.checksum }
  }

  return prisma.methodologyProfileVersion.update({
    where: { id: versionId },
    data: { status: "published", publishedAt: new Date() },
    select: { id: true, profileId: true, version: true, status: true, checksum: true, publishedAt: true },
  })
}
