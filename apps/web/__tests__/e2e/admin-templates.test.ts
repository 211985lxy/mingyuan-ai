import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  prisma, cleanDatabase, disconnectAll, cleanRedis,
  createAdminUser, createEditorUser, createTemplate,
  authReq, json,
} from "./helpers"
import { POST, GET } from "@/app/api/admin/templates/route"
import {
  GET as GET_BY_ID,
  PUT,
  DELETE,
} from "@/app/api/admin/templates/[id]/route"
import { POST as PUBLISH } from "@/app/api/admin/templates/[id]/publish/route"
import { POST as ARCHIVE } from "@/app/api/admin/templates/[id]/archive/route"
import { POST as RESTORE } from "@/app/api/admin/templates/[id]/restore/route"
import { PUT as FEATURE } from "@/app/api/admin/templates/[id]/feature/route"
import { PUT as SORT } from "@/app/api/admin/templates/[id]/sort/route"

let admin: { id: string; email: string; role: string }
let editor: { id: string; email: string; role: string }

describe("Admin Templates E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const a = await createAdminUser()
    admin = { id: a.id, email: a.email, role: a.role }
    const e = await createEditorUser()
    editor = { id: e.id, email: e.email, role: e.role }
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  // ─── Create ───────────────────────────────────────────

  it("rejects template without required fields", async () => {
    const res = await POST(
      authReq("/api/admin/templates", admin, {
        method: "POST",
        body: { name: "x" },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
  })

  let templateId: string

  it("creates a template", async () => {
    const res = await POST(
      authReq("/api/admin/templates", admin, {
        method: "POST",
        body: {
          name: "e2e-tpl",
          displayName: "E2E 模板",
          scriptTemplate: "你好{{name}}，{{city}}欢迎你！",
          contentType: "product_intro",
          variables: [
            { key: "name", label: "姓名", placeholder: "", required: true, type: "text" },
            { key: "city", label: "城市", placeholder: "", required: false, type: "text" },
          ],
          industry: ["教育"],
          tags: ["测试"],
          hotTopicKeywords: ["教育", "学习"],
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.data.name).toBe("e2e-tpl")
    expect(body.data.status).toBe("draft")
    expect(body.data.createdBy).toBe(admin.id)
    templateId = body.data.id
  })

  // ─── Read ─────────────────────────────────────────────

  it("lists templates", async () => {
    const res = await GET(
      authReq("/api/admin/templates", admin),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.results.length).toBeGreaterThanOrEqual(1)
    expect(body.data.total).toBeGreaterThanOrEqual(1)
  })

  it("lists templates filtered by status", async () => {
    const res = await GET(
      authReq("/api/admin/templates?status=draft", admin),
      undefined as never
    )
    const body = await json(res)
    expect(body.data.results.every((t: { status: string }) => t.status === "draft")).toBe(true)
  })

  it("gets template by ID", async () => {
    const res = await GET_BY_ID(
      authReq(`/api/admin/templates/${templateId}`, admin),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.id).toBe(templateId)
    expect(body.data.scriptTemplate).toContain("{{name}}")
  })

  it("returns 404 for non-existent template", async () => {
    const res = await GET_BY_ID(
      authReq("/api/admin/templates/nonexist", admin),
      { params: Promise.resolve({ id: "nonexist" }) }
    )
    expect(res.status).toBe(404)
  })

  // ─── Update ───────────────────────────────────────────

  it("updates template fields", async () => {
    const res = await PUT(
      authReq(`/api/admin/templates/${templateId}`, admin, {
        method: "PUT",
        body: { displayName: "更新后的模板", description: "新描述" },
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.displayName).toBe("更新后的模板")
    expect(body.data.description).toBe("新描述")

    // Verify in DB
    const dbRecord = await prisma.contentTemplate.findUnique({ where: { id: templateId } })
    expect(dbRecord!.displayName).toBe("更新后的模板")
  })

  // ─── Lifecycle: draft → published → archived → restored ─

  it("publishes a draft template", async () => {
    const res = await PUBLISH(
      authReq(`/api/admin/templates/${templateId}/publish`, admin, { method: "POST" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.status).toBe("published")
    expect(body.data.publishedAt).toBeTruthy()

    // Verify in DB
    const dbRecord = await prisma.contentTemplate.findUnique({ where: { id: templateId } })
    expect(dbRecord!.status).toBe("published")
  })

  it("rejects re-publishing a published template", async () => {
    const res = await PUBLISH(
      authReq(`/x/publish`, admin, { method: "POST" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(422)
  })

  it("archives a published template", async () => {
    const res = await ARCHIVE(
      authReq(`/x/archive`, admin, { method: "POST" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.status).toBe("archived")
  })

  it("restores an archived template", async () => {
    const res = await RESTORE(
      authReq(`/x/restore`, admin, { method: "POST" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.status).toBe("published")
    expect(body.data.archivedAt).toBeNull()
  })

  // ─── Feature & Sort ───────────────────────────────────

  it("toggles featured flag", async () => {
    const res = await FEATURE(
      authReq(`/x/feature`, admin, { method: "PUT", body: { featured: true } }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.featured).toBe(true)

    // Verify in DB
    const dbRecord = await prisma.contentTemplate.findUnique({ where: { id: templateId } })
    expect(dbRecord!.featured).toBe(true)
  })

  it("sets sort order", async () => {
    const res = await SORT(
      authReq(`/x/sort`, admin, { method: "PUT", body: { sortOrder: 99 } }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.sortOrder).toBe(99)
  })

  // ─── Delete ───────────────────────────────────────────

  it("rejects deleting non-draft template", async () => {
    // templateId is currently "published"
    const res = await DELETE(
      authReq(`/x/delete`, admin, { method: "DELETE" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(res.status).toBe(422)
  })

  it("editor cannot delete templates", async () => {
    // Create a draft for this test
    const draft = await createTemplate(admin.id, { name: "draft-for-delete", status: "draft" })
    const res = await DELETE(
      authReq(`/x/delete`, editor, { method: "DELETE" }),
      { params: Promise.resolve({ id: draft.id }) }
    )
    expect(res.status).toBe(403)
  })

  it("admin can delete a draft template", async () => {
    const draft = await createTemplate(admin.id, { name: "to-delete", status: "draft" })
    const res = await DELETE(
      authReq(`/x/delete`, admin, { method: "DELETE" }),
      { params: Promise.resolve({ id: draft.id }) }
    )
    expect(res.status).toBe(200)

    // Verify actually deleted from DB
    const gone = await prisma.contentTemplate.findUnique({ where: { id: draft.id } })
    expect(gone).toBeNull()
  })
})
