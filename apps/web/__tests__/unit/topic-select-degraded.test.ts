/**
 * POST /api/topics/[id]/select：降级模板卡不得被选用。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { DEGRADED_TOPIC_SELECT_MESSAGE } from "@/lib/topic-degradation"

const { withUserAuth, resolveBoundProject, findFirst, update } = vi.hoisted(() => ({
  withUserAuth: vi.fn(
    (handler: (request: NextRequest, context: { user: { id: string }; params?: Record<string, string> }) => Promise<Response>) =>
      async (request: NextRequest, segmentData: { params: Promise<Record<string, string>> }) => {
        const params = segmentData ? await segmentData.params : undefined
        return handler(request, { user: { id: "user-1" }, params })
      },
  ),
  resolveBoundProject: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({ withUserAuth }))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code: string
    status: number
    constructor(code: string, message: string, status = 409) {
      super(message)
      this.code = code
      this.status = status
    }
  },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { topicSelection: { findFirst, update } },
}))

import { POST } from "@/app/api/topics/[id]/select/route"

function runHandler(id: string, body: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/topics/${id}/select`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
  return POST(request, { params: Promise.resolve({ id }) }) as Promise<Response>
}

const CANDIDATES = [
  { title: "卡1" },
  { title: "卡2" },
  { title: "卡3" },
  { title: "卡4" },
]

beforeEach(() => {
  vi.clearAllMocks()
  resolveBoundProject.mockResolvedValue({ id: "project-1", name: "测试项目", status: "active" })
})

describe("POST /api/topics/[id]/select 降级卡治理", () => {
  it("model 带 :fallback 时返回 409 并明确提示重新生成", async () => {
    findFirst.mockResolvedValue({
      id: "sel-1",
      status: "pending",
      model: "business_diagnosis-route:fallback",
      candidates: CANDIDATES,
    })

    const response = await runHandler("sel-1", { selectedIndex: 0 })
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBe(DEGRADED_TOPIC_SELECT_MESSAGE)
    expect(update).not.toHaveBeenCalled()
  })

  it("正常 pending 记录可以选用", async () => {
    findFirst.mockResolvedValue({
      id: "sel-2",
      status: "pending",
      model: "deepseek-v4-flash",
      candidates: CANDIDATES,
    })
    update.mockResolvedValue({
      id: "sel-2",
      selectedIndex: 1,
      status: "selected",
      candidates: CANDIDATES,
    })

    const response = await runHandler("sel-2", { selectedIndex: 1 })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.selectedIndex).toBe(1)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
