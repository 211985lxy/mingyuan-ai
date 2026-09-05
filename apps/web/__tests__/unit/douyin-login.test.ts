import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMocks = vi.hoisted(() => ({
  challengeCreate: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    douyinLoginChallenge: {
      create: prismaMocks.challengeCreate,
    },
  },
}))

import { createDouyinLoginChallenge } from "@/features/auth/douyin-login"

describe("Douyin login challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("stores only a hashed state for a short-lived login challenge", async () => {
    prismaMocks.challengeCreate.mockResolvedValue({ id: "challenge-1" })

    const result = await createDouyinLoginChallenge({
      state: "raw-state",
      openId: "open-1",
      scope: "user_info",
    })

    expect(result).toBe("challenge-1")
    expect(prismaMocks.challengeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stateHash: expect.not.stringContaining("raw-state"),
        openId: "open-1",
        scope: "user_info",
        expiresAt: expect.any(Date),
      }),
    })
  })
})
