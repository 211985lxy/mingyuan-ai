import { describe, expect, it, vi, beforeEach } from "vitest"

// 用内存 store 模拟 ipWikiPage 表，验证「同类型归档旧页 + 版本递增」的增量语义
const store = new Map<string, Record<string, unknown>>()
let idCounter = 0

const ipWikiPage = {
  findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const rows = [...store.values()].filter(
      (r) =>
        r.projectId === where.projectId &&
        r.pageType === where.pageType &&
        r.status === where.status
    )
    rows.sort((a, b) => (b.version as number) - (a.version as number))
    return rows[0] ? { version: rows[0].version } : null
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    for (const r of [...store.values()]) {
      if (
        r.projectId === where.projectId &&
        r.pageType === where.pageType &&
        r.status === where.status
      ) {
        Object.assign(r, data)
      }
    }
    return { count: 0 }
  }),
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = `p-${++idCounter}`
    const row = { id, ...data, createdAt: "t", updatedAt: "t" }
    store.set(id, row)
    return row
  }),
  findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return [...store.values()]
      .filter(
        (r) => r.projectId === where.projectId && r.status === where.status
      )
      .sort((a, b) => String(a.pageType).localeCompare(String(b.pageType)))
  }),
}

vi.mock("@/lib/prisma", () => ({ prisma: { ipWikiPage } }))

const { saveIpWikiPageBatch, listIpWikiPages } = await import("@/lib/ip-wiki/repo")

describe("ip-wiki repo", () => {
  beforeEach(() => {
    store.clear()
    idCounter = 0
    ipWikiPage.findFirst.mockClear()
    ipWikiPage.updateMany.mockClear()
    ipWikiPage.create.mockClear()
    ipWikiPage.findMany.mockClear()
  })

  it("creates first version pages when none exist", async () => {
    const saved = await saveIpWikiPageBatch({
      userId: "u1",
      projectId: "proj-1",
      pages: [
        { pageType: "content_strategy", title: "内容策略底盘", content: "v1 策略", frontmatter: {}, sources: [], links: [] },
        { pageType: "positioning", title: "定位主张", content: "v1 定位", frontmatter: {}, sources: [], links: [] },
      ],
    })

    expect(saved).toHaveLength(2)
    expect(saved.every((r) => r.version === 1)).toBe(true)
    expect(saved.every((r) => r.status === "active")).toBe(true)
    // 无既有页时不应触发归档
    expect(ipWikiPage.updateMany).not.toHaveBeenCalled()
  })

  it("archives old same-type page and bumps version on recompile", async () => {
    await saveIpWikiPageBatch({
      userId: "u1",
      projectId: "proj-1",
      pages: [
        { pageType: "content_strategy", title: "内容策略底盘", content: "v1", frontmatter: {}, sources: [], links: [] },
      ],
    })

    const saved = await saveIpWikiPageBatch({
      userId: "u1",
      projectId: "proj-1",
      pages: [
        { pageType: "content_strategy", title: "内容策略底盘", content: "v2 更新", frontmatter: {}, sources: [], links: [] },
      ],
    })

    expect(saved[0].version).toBe(2)
    expect(saved[0].status).toBe("active")
    // 旧 v1 应被归档
    const archived = [...store.values()].filter((r) => r.status === "archived")
    expect(archived).toHaveLength(1)
    expect(archived[0].version).toBe(1)
  })

  it("lists only active pages", async () => {
    await saveIpWikiPageBatch({
      userId: "u1",
      projectId: "proj-1",
      pages: [
        { pageType: "content_strategy", title: "策略", content: "v1", frontmatter: {}, sources: [], links: [] },
      ],
    })
    await saveIpWikiPageBatch({
      userId: "u1",
      projectId: "proj-1",
      pages: [
        { pageType: "content_strategy", title: "策略", content: "v2", frontmatter: {}, sources: [], links: [] },
      ],
    })

    const active = await listIpWikiPages({ projectId: "proj-1" })
    expect(active).toHaveLength(1)
    expect(active[0].version).toBe(2)
  })
})
