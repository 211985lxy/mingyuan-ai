import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createPromptDraftVersion,
  listPromptTemplates,
  promotePromptVersion,
} from "@/lib/prompt/admin"

/**
 * Prompt 管理服务单测（替身 prisma，不连真实 DB）：
 * - 新建草稿：版本自增、未登记 key 首版需 domain
 * - 门禁升级：无 fixtureKey 升 qualified 拒绝（409）、draft 直升 active 拒绝
 * - active 唯一互斥：激活新版回落旧 active
 * - 写后热更：refresh(key) 被调用
 */

function makePrisma(overrides: Partial<Parameters<typeof listPromptTemplates>[0]> = {}) {
  const templateStore = new Map<string, { key: string; domain: string; description: string | null }>([
    ["aim.work_editor.chat", { key: "aim.work_editor.chat", domain: "aim", description: null }],
  ])
  const versionRows: Array<{
    id: string
    templateKey: string
    version: number
    content: string
    type: string
    status: "draft" | "qualified" | "active"
    fixtureKey: string | null
  }> = [
    {
      id: "v1",
      templateKey: "aim.work_editor.chat",
      version: 1,
      content: "v1 内容",
      type: "function",
      status: "active",
      fixtureKey: "eval.work_editor",
    },
  ]
  let seq = 1

  const prisma = {
    promptTemplate: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        templateStore.get(where.key) ?? null),
      upsert: vi.fn(async ({ where }: { where: { key: string } }) => {
        const row = templateStore.get(where.key) ?? { key: where.key, domain: "general", description: null }
        templateStore.set(where.key, row)
        return row
      }),
      findMany: vi.fn(async () =>
        [...templateStore.values()].map((template) => ({
          ...template,
          versions: versionRows
            .filter((v) => v.templateKey === template.key)
            .sort((a, b) => b.version - a.version),
        })),
      ),
    },
    promptVersion: {
      findFirst: vi.fn(async ({ where }: { where: { templateKey: string; version: number } }) =>
        versionRows.find((v) => v.templateKey === where.templateKey && v.version === where.version) ?? null),
      aggregate: vi.fn(async ({ where }: { where: { templateKey: string } }) => ({
        _max: {
          version: versionRows
            .filter((v) => v.templateKey === where.templateKey)
            .reduce((max, v) => Math.max(max, v.version), 0),
        },
      })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `v${++seq}`,
          templateKey: String(data.templateKey),
          version: Number(data.version),
          content: String(data.content),
          type: String(data.type),
          status: data.status as "draft",
          fixtureKey: (data.fixtureKey as string | null) ?? null,
        }
        versionRows.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const row = versionRows.find((v) => v.id === where.id)!
        row.status = data.status as typeof row.status
        return row
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { templateKey: string; status: string; id: { not: string } }
        data: { status: string }
      }) => {
        let count = 0
        for (const row of versionRows) {
          if (row.templateKey === where.templateKey && row.status === where.status && row.id !== where.id.not) {
            row.status = data.status as typeof row.status
            count += 1
          }
        }
        return { count }
      }),
    },
  }
  return { prisma: Object.assign(prisma, overrides ?? {}), versionRows, templateStore }
}

vi.mock("@/lib/prompt/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prompt/registry")>()
  return { ...actual, promptRegistry: { ...actual.promptRegistry, refresh: vi.fn(async () => undefined) } }
})

const { promptRegistry } = await import("@/lib/prompt/registry")

const refreshMock = promptRegistry.refresh as unknown as ReturnType<typeof vi.fn>

const KEY = "aim.work_editor.chat"

describe("Prompt 管理服务", () => {
  beforeEach(() => {
    refreshMock.mockClear()
  })

  it("listPromptTemplates 返回模板与倒序版本", async () => {
    const { prisma } = makePrisma()
    const templates = await listPromptTemplates(prisma)
    expect(templates[0].key).toBe(KEY)
    expect(templates[0].versions?.[0].version).toBe(1)
  })

  it("新建草稿版本自增；写后 refresh(key) 被调用（热更联动）", async () => {
    const { prisma } = makePrisma()
    const created = await createPromptDraftVersion(
      { key: KEY, content: "v2 新内容", fixtureKey: "eval.work_editor.v2" },
      prisma,
    )
    expect(created.version).toBe(2)
    expect(created.status).toBe("draft")
    expect(refreshMock).toHaveBeenCalledWith(KEY)
  })

  it("未登记 key 的首个版本缺 domain 时 400", async () => {
    const { prisma } = makePrisma()
    await expect(
      createPromptDraftVersion({ key: "brand.new.key", content: "内容" }, prisma),
    ).rejects.toMatchObject({ code: "PROMPT_TEMPLATE_UNKNOWN" })
  })

  it("门禁：v1(active) 再升 active 幂等拒绝；升 qualified 因已带 fixtureKey 放行", async () => {
    const { prisma } = makePrisma()
    await expect(
      promotePromptVersion({ key: KEY, version: 1, toStatus: "active" }, prisma),
    ).rejects.toMatchObject({ code: "PROMPT_PROMOTION_REJECTED" })

    const result = await promotePromptVersion({ key: KEY, version: 1, toStatus: "qualified" }, prisma)
    expect(result.version.status).toBe("qualified")
  })

  it("active 唯一互斥：激活新版本时旧 active 回落 qualified", async () => {
    const { prisma, versionRows } = makePrisma()
    // v2 draft（带 fixtureKey）→ qualified → active
    await createPromptDraftVersion(
      { key: KEY, content: "v2 新内容", fixtureKey: "eval.work_editor.v2" },
      prisma,
    )
    await promotePromptVersion({ key: KEY, version: 2, toStatus: "qualified" }, prisma)
    const result = await promotePromptVersion({ key: KEY, version: 2, toStatus: "active" }, prisma)

    expect(result.demoted).toBe(1)
    expect(result.version.status).toBe("active")
    expect(versionRows.find((v) => v.version === 1)?.status).toBe("qualified")
    expect(versionRows.find((v) => v.version === 2)?.status).toBe("active")
  })

  it("门禁：无 fixtureKey 的草稿升 qualified 被 409 拒绝", async () => {
    const { prisma } = makePrisma()
    await createPromptDraftVersion({ key: KEY, content: "v2 无评测" }, prisma)
    await expect(
      promotePromptVersion({ key: KEY, version: 2, toStatus: "qualified" }, prisma),
    ).rejects.toMatchObject({ code: "PROMPT_PROMOTION_REJECTED" })
  })
})
