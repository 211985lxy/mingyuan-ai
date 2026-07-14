import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const createMany = vi.hoisted(() => vi.fn())
const recordAdminAudit = vi.hoisted(() => vi.fn())

vi.mock("@/lib/admin-auth", () => ({
  withAdminAuth: (handler: (request: NextRequest, context: { admin: { id: string } }) => Promise<Response>) =>
    (request: NextRequest) => handler(request, { admin: { id: "admin-1" } }),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activationCode: { createMany },
  },
}))

vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit }))

import { POST } from "@/app/api/admin/activation-codes/generate/route"

function req(body: unknown) {
  return new NextRequest(new URL("http://localhost/api/admin/activation-codes/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("activation code generation", () => {
  it("defaults beta activation codes to 14 days", async () => {
    createMany.mockResolvedValue({ count: 1 })
    recordAdminAudit.mockResolvedValue("request-1")

    const res = await POST(req({ quantity: 1 }), { params: Promise.resolve({}) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.durationDays).toBe(14)
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ durationDays: 14, createdBy: "admin-1" }),
      ]),
    })
    expect(recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "admin-1",
      action: "activation_codes.generate",
      targetType: "activation_code_batch",
    }))
  })
})
