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
