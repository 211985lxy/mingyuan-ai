import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  withUserAuth,
  resolveBoundProject,
  clientProjectFindFirst,
  ipProfileFindUnique,
  watchAccountFindMany,
  recommendWatchVideos,
} = vi.hoisted(() => ({
  withUserAuth: vi.fn(
    (handler: (request: NextRequest, context: { user: { id: string } }) => Promise<Response>) =>
      async (request: NextRequest) => handler(request, { user: { id: "user-1" } }),
  ),
  resolveBoundProject: vi.fn(),
  clientProjectFindFirst: vi.fn(),
  ipProfileFindUnique: vi.fn(),
  watchAccountFindMany: vi.fn(),
  recommendWatchVideos: vi.fn(() => []),
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
  prisma: {
    clientProject: { findFirst: clientProjectFindFirst },
    ipProfile: { findUnique: ipProfileFindUnique },
    watchAccount: { findMany: watchAccountFindMany },
  },
}))
vi.mock("@/lib/competitor-watch-recommendations", () => ({
  WATCH_VIDEO_RECOMMENDATION_CATEGORIES: [],
  recommendWatchVideos,
}))

import { POST } from "@/app/api/competitor/watch-accounts/recommendations/route"
import { AccountProjectContextError } from "@/lib/account-project-context"

function postHandler(body?: Record<string, unknown>) {
  const request = new NextRequest("http://localhost/api/competitor/watch-accounts/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  // mock 的 withUserAuth 直通 wrapper 只消费 request；这里补上 Next 16 的
  // segmentData 仅满足导出 POST 的外层签名，运行时被 mock 忽略。
  return POST(request, { params: Promise.resolve({}) }) as Promise<Response>
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveBoundProject.mockResolvedValue({ id: "project-ai", name: "AI商业顾问", status: "active" })
  clientProjectFindFirst.mockResolvedValue({ name: "AI商业顾问", industry: null, targetCustomer: null, offer: null, deliveryGoal: null })
  ipProfileFindUnique.mockRejectedValue(new Error("no profile"))
  watchAccountFindMany.mockResolvedValue([])
})

describe("POST /api/competitor/watch-accounts/recommendations account-project scope", () => {
  it("rejects a body project id that is not the bound project (no watch-account read)", async () => {
    resolveBoundProject.mockRejectedValue(
      new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "当前账号只能使用已绑定的项目", 409),
    )

    const response = await postHandler({ projectId: "project-old", intent: "对标旧项目" })

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("PROJECT_CONTEXT_MISMATCH")
    expect(watchAccountFindMany).not.toHaveBeenCalled()
  })

  it("resolves an absent body projectId to the bound project and scopes watch accounts to it", async () => {
    const response = await postHandler({ intent: "看对标" })

    expect(response.status).toBe(200)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: undefined })
    // Old-project / null-project watch accounts must never reach the bound workspace.
    expect(watchAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", projectId: "project-ai" } }),
    )
  })

  it("accepts a body projectId that matches the bound project and reads only that project", async () => {
    const response = await postHandler({ projectId: "project-ai", limit: 6 })

    expect(response.status).toBe(200)
    expect(resolveBoundProject).toHaveBeenCalledWith({ userId: "user-1", requestedProjectId: "project-ai" })
    expect(watchAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", projectId: "project-ai" } }),
    )
    await expect(response.json()).resolves.toMatchObject({
      data: { items: [], sourceSummary: { accountCount: 0, videoCount: 0 } },
    })
  })
})
