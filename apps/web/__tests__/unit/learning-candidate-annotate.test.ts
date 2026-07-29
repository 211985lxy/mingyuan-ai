import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
  prisma: {
    learningCandidate: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))

import { annotateLearningCandidate } from "@/lib/aim/learning-candidate-store"

describe("annotateLearningCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("拒绝空 annotation={}", async () => {
    await expect(annotateLearningCandidate({
      candidateId: "cand_1",
      annotation: {},
      reviewerId: "reviewer_1",
    })).rejects.toThrow(/annotation 不能为空对象/)
    expect(prisma.learningCandidate.findUnique).not.toHaveBeenCalled()
  })

  it("pending 候选可写入非空标注", async () => {
    prisma.learningCandidate.findUnique.mockResolvedValue({
      id: "cand_1",
      reviewStatus: "pending",
      payload: { note: "seed" },
    })
    prisma.learningCandidate.update.mockResolvedValue({ id: "cand_1" })
    await annotateLearningCandidate({
      candidateId: "cand_1",
      annotation: { label: "good" },
      reviewerId: "reviewer_1",
    })
    expect(prisma.learningCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewerId: "reviewer_1",
          payload: expect.objectContaining({
            note: "seed",
            annotation: { label: "good" },
          }),
        }),
      }),
    )
  })
})
