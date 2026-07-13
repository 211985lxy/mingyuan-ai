import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  AIM_CHAT_PENDING_TEXT,
  AIM_CHAT_STOPPED_TEXT,
  buildAimChatFailureText,
  buildAimGenerationPendingText,
  canStartAimGeneration,
} from "@/features/aim/aim-request-state"

const request = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/core", () => ({
  ApiError: class ApiError extends Error {},
  getApiErrorMessage: vi.fn(),
  request,
}))

describe("AIM composer generate button", () => {
  beforeEach(() => request.mockReset())

  it("requires current input or an image instead of old messages", () => {
    const base = {
      imageCount: 0,
      projectEnabled: false,
      projectId: "",
      uploadingImage: false,
    }

    expect(canStartAimGeneration({ ...base, text: "" })).toBe(false)
    expect(canStartAimGeneration({ ...base, text: "写一版" })).toBe(true)
    expect(canStartAimGeneration({ ...base, text: "", imageCount: 1 })).toBe(true)
  })

  it("builds a visible generation status before the result replaces it", () => {
    expect(buildAimGenerationPendingText("生成内容")).toBe(
      "正在生成内容，会先读取项目资料、匹配知识库，再生成交付物…",
    )
  })

  it("keeps chat request status and failure messages in one contract", () => {
    expect(AIM_CHAT_PENDING_TEXT).toContain("正在思考")
    expect(AIM_CHAT_STOPPED_TEXT).toBe("已停止本次回复。")
    expect(buildAimChatFailureText("网络错误")).toBe("对话失败：网络错误")
  })

  it("allows long-running generation requests", async () => {
    request.mockResolvedValue({ id: "generation-1", results: [], knowledgeUsed: [] })
    const { generateAimContent } = await import("@/lib/api/aim")

    await generateAimContent({ rawInput: "写一版" })

    expect(request).toHaveBeenCalledWith("/api/aim/generate", expect.objectContaining({
      timeout: 180000,
    }))
  })
})
