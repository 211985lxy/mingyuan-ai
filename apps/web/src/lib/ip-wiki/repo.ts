import { prisma } from "@/lib/prisma"
import type { IpWikiPageType, IpWikiSourceRef } from "@/lib/ip-wiki/types"

/**
 * IP 定位维基 · 数据访问
 *
 * 增量语义（Karpathy「更新而非重复」）：保存某类型的页时，归档该类型旧的 active 页，
 * 新页 version 递增。历史页以 archived 保留，可溯源；查询只取 active。
 */

export interface SaveIpWikiPageInput {
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiSourceRef[]
  links: string[]
}

export interface IpWikiPageRow {
  id: string
  projectId: string
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiSourceRef[]
  links: string[]
  sourceGenerationId: string | null
  version: number
  status: string
  createdAt: Date
  updatedAt: Date
}

/**
 * @description 列出ipwikipages
 * @param options - 配置选项
 * @returns Promise<IpWikiPageRow[]>
 */
export async function listIpWikiPages(options: {
  projectId: string
  status?: string
  pageTypes?: IpWikiPageType[]
}): Promise<IpWikiPageRow[]> {
  const status = options.status ?? "active"
  const where: {
    projectId: string
    status: string
    pageType?: { in: string[] }
  } = { projectId: options.projectId, status }
  if (options.pageTypes && options.pageTypes.length > 0) {
    where.pageType = { in: options.pageTypes }
  }

  return prisma.ipWikiPage.findMany({
    where,
    orderBy: [{ pageType: "asc" }, { updatedAt: "desc" }],
    take: 200,
  }) as unknown as Promise<IpWikiPageRow[]>
}

/**
 * 保存一批确认后的维基页。同类型旧 active 页归档，新页 version+1。
 */
/**
 * @description saveipwikipagebatch
 * @param input - 输入数据
 * @returns Promise<IpWikiPageRow[]>
 */
export async function saveIpWikiPageBatch(input: {
  userId: string
  projectId: string
  sourceGenerationId?: string
  pages: SaveIpWikiPageInput[]
}): Promise<IpWikiPageRow[]> {
  const saved: IpWikiPageRow[] = []

  for (const page of input.pages) {
    const latest = await prisma.ipWikiPage.findFirst({
      where: { projectId: input.projectId, pageType: page.pageType, status: "active" },
      orderBy: { version: "desc" },
      select: { version: true },
    })

    if (latest) {
      await prisma.ipWikiPage.updateMany({
        where: {
          projectId: input.projectId,
          pageType: page.pageType,
          status: "active",
        },
        data: { status: "archived" },
      })
    }

    const row = await prisma.ipWikiPage.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        pageType: page.pageType,
        title: page.title,
        content: page.content,
        frontmatter: (page.frontmatter ?? {}) as object,
        sources: (page.sources ?? []) as object,
        links: (page.links ?? []) as object,
        sourceGenerationId: input.sourceGenerationId ?? null,
        version: (latest?.version ?? 0) + 1,
        status: "active",
      },
    })
    saved.push(row as unknown as IpWikiPageRow)
  }

  return saved
}

/**
 * 单页编辑：人工自助编辑某 active 维基页的可变字段（title/content/frontmatter/links）。
 *
 * 与 saveIpWikiPageBatch 同样的归档语义——同 (projectId, pageType) 的旧 active 页归档，
 * 新建 version+1 的 active 页——保持单一 active 不变量与完整审计轨迹；pageType/sources/
 * sourceGenerationId 不可变（编辑不改类型、不改来源溯源）。
 *
 * 鉴权：按 (id, projectId, userId, status:"active") 锁定目标页，找不到返回 null（route 404）。
 * 仅更新传入的 patch 字段；未传的 frontmatter/links 保留原页值。
 */
export async function updateIpWikiPage(input: {
  userId: string
  projectId: string
  id: string
  patch: {
    title?: string
    content?: string
    frontmatter?: Record<string, unknown>
    links?: string[]
  }
}): Promise<IpWikiPageRow | null> {
  const current = await prisma.ipWikiPage.findFirst({
    where: { id: input.id, projectId: input.projectId, userId: input.userId, status: "active" },
    select: {
      id: true,
      pageType: true,
      version: true,
      title: true,
      content: true,
      frontmatter: true,
      sources: true,
      links: true,
      sourceGenerationId: true,
    },
  })
  if (!current) return null

  const pageType = current.pageType as IpWikiPageType

  // 归档同类型旧 active（与 batch 写入一致：保证同一 pageType 只剩一条 active）
  await prisma.ipWikiPage.updateMany({
    where: { projectId: input.projectId, pageType, status: "active" },
    data: { status: "archived" },
  })

  const title =
    typeof input.patch.title === "string"
      ? input.patch.title.trim().slice(0, 120)
      : current.title
  const content =
    typeof input.patch.content === "string" ? input.patch.content.slice(0, 8000) : current.content
  const frontmatter =
    input.patch.frontmatter && typeof input.patch.frontmatter === "object"
      ? (input.patch.frontmatter as Record<string, unknown>)
      : (current.frontmatter as Record<string, unknown>)
  const links = Array.isArray(input.patch.links)
    ? input.patch.links
    : (current.links as string[])

  const row = await prisma.ipWikiPage.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      pageType,
      title,
      content,
      frontmatter: frontmatter as object,
      // 来源溯源不可变：编辑只改内容，不改来源指向（sources / sourceGenerationId 沿用原页）
      sources: (current.sources ?? []) as object,
      links: links as object,
      sourceGenerationId: current.sourceGenerationId ?? null,
      version: (current.version ?? 0) + 1,
      status: "active",
    },
  })
  return row as unknown as IpWikiPageRow
}
