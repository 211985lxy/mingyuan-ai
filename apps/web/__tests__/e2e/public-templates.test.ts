import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  prisma, cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, createTemplate, req, json,
} from "./helpers"
import { GET } from "@/app/api/templates/route"
import { GET as GET_BY_ID } from "@/app/api/templates/[id]/route"
import { POST as GENERATE } from "@/app/api/templates/[id]/generate/route"
import { syncCanonicalContentTemplates } from "../../prisma/seed-templates"

let publishedId: string
let draftId: string

describe("Public Templates E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const admin = await createAdminUser()
    await syncCanonicalContentTemplates(prisma)

    // Create published template
    const published = await createTemplate(admin.id, {
      name: "pub-tpl",
      displayName: "公开模板",
      scriptTemplate: "你好{{name}}，来自{{city}}的朋友！",
      status: "published",
      publishedAt: new Date(),
      contentType: "product_intro",
      industry: ["教育"],
      featured: true,
      variables: [
        { key: "name", label: "姓名", placeholder: "", required: true, type: "text" },
        { key: "city", label: "城市", placeholder: "", required: false, type: "text" },
      ],
    })
    publishedId = published.id

    // Create another published template for filtering
    await createTemplate(admin.id, {
      name: "pub-tpl-2",
      displayName: "促销模板",
      status: "published",
      publishedAt: new Date(),
      contentType: "promotion",
      industry: ["电商"],
      featured: false,
    })

    // Create draft (should NOT appear in public API)
    const draft = await createTemplate(admin.id, {
      name: "draft-tpl",
      status: "draft",
    })
    draftId = draft.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  // ─── List ─────────────────────────────────────────────

  it("returns only published templates", async () => {
    const res = await GET(req("/api/templates"))
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.results.length).toBeGreaterThanOrEqual(18)
    expect(body.data.results.some((t: { id: string }) => t.id === publishedId)).toBe(true)
    expect(body.data.results.every((t: { id: string }) => t.id !== draftId)).toBe(true)
  })

  it("auto-syncs canonical expression templates", async () => {
    const res = await GET(req("/api/templates"))
    const body = await json(res)
    const canonical = body.data.results.find((t: { displayName: string }) => t.displayName === "痛点解决")
    expect(canonical).toBeTruthy()
    expect(canonical.expressionBlueprint).toMatchObject({
      argumentPattern: "problem_solution",
      proofBurden: "medium",
    })
  })

  it("does not expose scriptTemplate in list", async () => {
    const res = await GET(req("/api/templates"))
    const body = await json(res)
    for (const t of body.data.results) {
      expect(t.scriptTemplate).toBeUndefined()
    }
  })

  it("filters by contentType", async () => {
    const res = await GET(req("/api/templates?contentType=promotion"))
    const body = await json(res)
    expect(body.data.results.length).toBe(1)
    expect(body.data.results[0].contentType).toBe("promotion")
  })

  it("filters by featured", async () => {
    const res = await GET(req("/api/templates?featured=true"))
    const body = await json(res)
    expect(body.data.results.length).toBeGreaterThanOrEqual(1)
    expect(body.data.results.every((t: { featured: boolean }) => t.featured)).toBe(true)
    expect(body.data.results.some((t: { id: string }) => t.id === publishedId)).toBe(true)
  })

  it("filters by industry", async () => {
    const res = await GET(req("/api/templates?industry=电商"))
    const body = await json(res)
    expect(body.data.results.length).toBe(1)
  })

  it("searches by displayName", async () => {
    const res = await GET(req("/api/templates?search=促销"))
    const body = await json(res)
    expect(body.data.results.length).toBe(1)
    expect(body.data.results[0].displayName).toContain("促销")
  })

  it("paginates correctly", async () => {
    const res = await GET(req("/api/templates?page=1&pageSize=1"))
    const body = await json(res)
    expect(body.data.results.length).toBe(1)
    expect(body.data.total).toBeGreaterThanOrEqual(18)
  })

  it("returns Cache-Control header", async () => {
    const res = await GET(req("/api/templates"))
    expect(res.headers.get("Cache-Control")).toContain("max-age=1800")
  })

  // ─── Detail ───────────────────────────────────────────

  it("returns published template detail", async () => {
    const res = await GET_BY_ID(req(`/api/templates/${publishedId}`), {
      params: Promise.resolve({ id: publishedId }),
    })
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.id).toBe(publishedId)
    expect(body.data.scriptTemplate).toContain("{{name}}")
  })

  it("returns 404 for draft template", async () => {
    const res = await GET_BY_ID(req(`/api/templates/${draftId}`), {
      params: Promise.resolve({ id: draftId }),
    })
    expect(res.status).toBe(404)
  })

  // ─── Script generation ────────────────────────────────

  it("rejects generate without variables", async () => {
    const res = await GENERATE(
      req(`/api/templates/${publishedId}/generate`, {
        method: "POST",
        body: {},
      }),
      { params: Promise.resolve({ id: publishedId }) }
    )
    expect(res.status).toBe(400)
  })

  it("rejects generate with missing required variables", async () => {
    const res = await GENERATE(
      req(`/api/templates/${publishedId}/generate`, {
        method: "POST",
        body: { variables: { city: "北京" } }, // missing required 'name'
      }),
      { params: Promise.resolve({ id: publishedId }) }
    )
    expect(res.status).toBe(400)

    const body = await json(res)
    expect(body.error).toContain("name")
  })

  it("generates script with real template rendering", async () => {
    const res = await GENERATE(
      req(`/api/templates/${publishedId}/generate`, {
        method: "POST",
        body: { variables: { name: "张三", city: "深圳" } },
      }),
      { params: Promise.resolve({ id: publishedId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.script).toBe("你好张三，来自深圳的朋友！")
    expect(body.data.templateId).toBe(publishedId)
    expect(body.data.templateName).toBe("公开模板")
  })

  it("increments usageCount in database after generation", async () => {
    // Wait a moment for the fire-and-forget update
    await new Promise((r) => setTimeout(r, 200))

    const tpl = await prisma.contentTemplate.findUnique({ where: { id: publishedId } })
    expect(tpl!.usageCount).toBeGreaterThanOrEqual(1)
  })

  it("rejects generate on non-published template", async () => {
    const res = await GENERATE(
      req(`/api/templates/${draftId}/generate`, {
        method: "POST",
        body: { variables: { name: "test" } },
      }),
      { params: Promise.resolve({ id: draftId }) }
    )
    expect(res.status).toBe(404)
  })
})
