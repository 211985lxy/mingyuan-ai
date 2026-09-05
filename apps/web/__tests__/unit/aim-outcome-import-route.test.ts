import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { findFirst, upsert, authenticateRequest, authErrorResponse, parseDocument, enforceUploadSizeLimit } =
  vi.hoisted(() => ({
    findFirst: vi.fn(),
    upsert: vi.fn(),
    authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
    authErrorResponse: vi.fn(() => null),
    parseDocument: vi.fn(async () => ["播放量：1,200 点赞数：350 评论数：88 私信数：12 近7天"]),
    enforceUploadSizeLimit: vi.fn(() => null),
  }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { findFirst },
    contentOutcome: { upsert },
  },
}))
vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/document-parser", () => ({ parseDocument }))
vi.mock("@/lib/internal-beta-limits", () => ({ enforceUploadSizeLimit }))

import { POST } from "@/app/api/aim/outcome-import/route"

function request(form: FormData) {
  return new NextRequest("http://localhost/api/aim/outcome-import", { method: "POST", body: form })
}

function csvForm(text: string, generationId = "gen-1") {
  const form = new FormData()
  form.set("generationId", generationId)
  form.set("file", new File([text], "export.csv", { type: "text/csv" }))
  return form
}

describe("aim outcome-import route（复盘表格导入 P1a）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceUploadSizeLimit.mockReturnValue(null)
    parseDocument.mockResolvedValue(["播放量：1,200 点赞数：350 评论数：88 私信数：12 近7天"])
    findFirst.mockResolvedValue({ id: "gen-1", topicSelectionId: "topic-1", projectId: "proj-1" })
    upsert.mockImplementation(async (args: { create: Record<string, unknown> }) => ({ id: "outcome-1", ...args.create }))
  })

  it("缺 generationId 拒绝（400），不触碰解析", async () => {
    const form = new FormData()
    form.set("file", new File(["播放量：100"], "a.csv", { type: "text/csv" }))
    const response = await POST(request(form))
    expect(response.status).toBe(400)
    expect(parseDocument).not.toHaveBeenCalled()
  })

  it("缺文件拒绝（400）", async () => {
    const form = new FormData()
    form.set("generationId", "gen-1")
    const response = await POST(request(form))
    expect(response.status).toBe(400)
  })

  it("跨用户内容 404", async () => {
    findFirst.mockResolvedValue(null)
    const response = await POST(request(csvForm("播放量：100", "gen-other")))
    expect(response.status).toBe(404)
  })

  it("文件解析失败如实返回 400，不写库", async () => {
    parseDocument.mockRejectedValue(new Error("损坏的 xlsx"))
    const response = await POST(request(csvForm("播放量：100")))
    expect(response.status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it("解析不出数字字段返回 422，不写库、不编数字", async () => {
    parseDocument.mockResolvedValue(["这是一段没有任何数字指标的文本"])
    const response = await POST(request(csvForm("随便什么")))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("没有识别到") })
    expect(upsert).not.toHaveBeenCalled()
  })

  it("正常导入：识别字段 upsert，未识别字段不出现在 create/update", async () => {
    const response = await POST(request(csvForm("播放量：1,200 点赞数：350")))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.summary).toContain("views=1200")
    expect(upsert).toHaveBeenCalledTimes(1)
    const args = upsert.mock.calls[0][0] as {
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(args.create.views).toBe(1200)
    expect(args.create.likes).toBe(350)
    expect(args.create.dealCount).toBeNull() // create 里未识别为 null
    expect(args.update).not.toHaveProperty("dealCount") // update 只覆盖识别出的字段
    expect(args.update.views).toBe(1200)
  })
})
