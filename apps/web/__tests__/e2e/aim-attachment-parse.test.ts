import { NextRequest } from "next/server"
import { describe, it, expect, beforeAll, afterAll } from "vitest"

import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  signUserAuthToken,
} from "./helpers"
import { POST } from "@/app/api/aim/attachment-parse/route"

let token: string

function formRequest(form: FormData, bearer?: string) {
  const headers: Record<string, string> = {}
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  return new NextRequest("http://localhost/api/aim/attachment-parse", {
    method: "POST",
    body: form,
    headers,
  })
}

function fileForm(file: File) {
  const form = new FormData()
  form.set("file", file)
  return form
}

describe("aim attachment-parse route（聊天文件附件）", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const user = await prisma.user.create({
      data: {
        email: "attachment-test@test.com",
        password: "hashed",
        name: "Attachment Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    token = signUserAuthToken({ id: user.id, email: user.email })
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("未登录拒绝（401）", async () => {
    const form = fileForm(new File(["标题,播放\nA,100"], "data.tst", { type: "" }))
    const response = await POST(formRequest(form))
    expect(response.status).toBe(401)
  })

  it("未知扩展名的文本文件解析成功（.tst）", async () => {
    const form = fileForm(new File(["日期,播放量,涨粉\n2026-09-01,12000,300"], "发布数据.tst", { type: "" }))
    const response = await POST(formRequest(form, token))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.name).toBe("发布数据.tst")
    expect(data.text).toContain("播放量")
    expect(data.truncated).toBe(false)
  })

  it("已知格式走 parseDocument（.md）", async () => {
    const form = fileForm(new File(["# 标题\n正文内容"], "brief.md", { type: "text/markdown" }))
    const response = await POST(formRequest(form, token))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.text).toContain("正文内容")
  })

  it("二进制内容拒绝（415）", async () => {
    const binary = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array(64).fill(0x11)])
    const form = fileForm(new File([binary], "pack.zip", { type: "application/zip" }))
    const response = await POST(formRequest(form, token))
    expect(response.status).toBe(415)
    const data = await response.json()
    expect(data.error).toContain("不是文本文件")
  })

  it("空文件拒绝（422）", async () => {
    const form = fileForm(new File([""], "empty.tst", { type: "" }))
    const response = await POST(formRequest(form, token))
    expect(response.status).toBe(422)
  })

  it("多文件拒绝（400）", async () => {
    const form = new FormData()
    form.set("file", new File(["a"], "a.tst", { type: "" }))
    form.append("file", new File(["b"], "b.tst", { type: "" }))
    const response = await POST(formRequest(form, token))
    expect(response.status).toBe(400)
  })

  it("缺文件拒绝（400）", async () => {
    const response = await POST(formRequest(new FormData(), token))
    expect(response.status).toBe(400)
  })
})
