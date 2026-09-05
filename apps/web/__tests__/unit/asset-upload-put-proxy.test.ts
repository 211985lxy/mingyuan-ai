import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { uploadBufferToOss, loadCompletableReservation } = vi.hoisted(() => ({
  uploadBufferToOss: vi.fn(async () => "https://bucket.example/key"),
  loadCompletableReservation: vi.fn(async () => ({
    id: "up-1",
    userId: "user-1",
    objectKey: "uploads/user-1/up-1/a.png",
    declaredSizeBytes: 5,
    contentType: "image/png",
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
  })),
}))

vi.mock("@/lib/oss", () => ({ uploadBufferToOss }))
vi.mock("@/lib/oss/upload-reservation", () => ({
  loadCompletableReservation,
  UploadReservationError: class UploadReservationError extends Error {
    status: number
    code: string
    constructor(message: string, options?: { status?: number; code?: string }) {
      super(message)
      this.status = options?.status ?? 400
      this.code = options?.code ?? "UPLOAD_RESERVATION_ERROR"
    }
  },
}))
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (request: NextRequest, ctx: { user: { id: string }; params?: unknown }) => Promise<Response>) =>
    async (request: NextRequest, ctx?: { params?: unknown }) =>
      handler(request, { user: { id: "user-1" }, params: ctx?.params }),
}))

import { POST } from "@/app/api/assets/uploads/[uploadId]/put/route"

function putRequest(uploadId: string, file: File | null) {
  const form = new FormData()
  if (file) form.set("file", file)
  return new NextRequest(`http://localhost/api/assets/uploads/${uploadId}/put`, {
    method: "POST",
    body: form,
  })
}

describe("assets upload proxy put route（同源兜底上传）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("缺 file 拒绝（400）", async () => {
    const response = await POST(putRequest("up-1", null), { params: { uploadId: "up-1" } })
    expect(response.status).toBe(400)
    expect(loadCompletableReservation).not.toHaveBeenCalled()
  })

  it("预约校验通过 → 服务端写入 OSS 并返回 200", async () => {
    const file = new File(["12345"], "a.png", { type: "image/png" })
    const response = await POST(putRequest("up-1", file), { params: { uploadId: "up-1" } })
    expect(response.status).toBe(200)
    expect(uploadBufferToOss).toHaveBeenCalledWith(
      "uploads/user-1/up-1/a.png",
      expect.any(Buffer),
      "image/png",
    )
  })

  it("文件大小与预约不符拒绝（400），不触碰 OSS", async () => {
    const file = new File(["1234567890"], "a.png", { type: "image/png" })
    const response = await POST(putRequest("up-1", file), { params: { uploadId: "up-1" } })
    expect(response.status).toBe(400)
    expect(uploadBufferToOss).not.toHaveBeenCalled()
  })

  it("预约不存在返回路由给的 404", async () => {
    const { UploadReservationError } = await import("@/lib/oss/upload-reservation")
    loadCompletableReservation.mockRejectedValueOnce(
      new UploadReservationError("上传预约不存在", { status: 404, code: "UPLOAD_NOT_FOUND" }),
    )
    const file = new File(["12345"], "a.png", { type: "image/png" })
    const response = await POST(putRequest("missing", file), { params: { uploadId: "missing" } })
    expect(response.status).toBe(404)
  })
})
