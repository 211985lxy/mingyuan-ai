import { beforeEach, describe, expect, it, vi } from "vitest"
import { proofreadAimResponse } from "@/lib/aim/generation-proofread"
import { polishScript, type AimGenerateResponse } from "@/lib/api/client"

vi.mock("@/lib/api/client", () => ({ polishScript: vi.fn() }))

const response: AimGenerateResponse = {
  id: "generation-1",
  knowledgeUsed: [],
  results: [
    { format: "video_script", content: "这是一段超过三十个字符并且需要进入校对流程的口播文案原稿内容。", wordCount: 30 },
    { format: "moments_post", content: "朋友圈原稿", wordCount: 6 },
  ],
}

describe("proofreadAimResponse", () => {
  beforeEach(() => vi.clearAllMocks())

  it("proofreads supported long-form results and preserves other formats", async () => {
    vi.mocked(polishScript).mockResolvedValue({ polished: "校对后的口播文案", changes: [] })
    const result = await proofreadAimResponse(response, "老板口吻")

    expect(result.results[0]).toMatchObject({ content: "校对后的口播文案", wordCount: 8 })
    expect(result.results[1]).toEqual(response.results[1])
    expect(polishScript).toHaveBeenCalledWith(expect.objectContaining({ mode: "proofread", persona: "老板口吻" }))
  })

  it("keeps the original result when proofreading fails", async () => {
    vi.mocked(polishScript).mockRejectedValue(new Error("timeout"))
    const result = await proofreadAimResponse(response, "老板口吻")

    expect(result.results).toEqual(response.results)
  })
})
