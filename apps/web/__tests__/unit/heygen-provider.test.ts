import { describe, expect, it } from "vitest"
import { mapHeygenVideoToTaskResult } from "@/lib/heygen"

describe("HeyGen 任务映射", () => {
  it("completed 映射为 succeed 并带出成片与时长", () => {
    const mapped = mapHeygenVideoToTaskResult({
      id: "v1",
      status: "completed",
      video_url: "https://files.heygen.ai/v1.mp4",
      thumbnail_url: "https://files.heygen.ai/v1.jpg",
      duration: 12.5,
    })
    expect(mapped.status).toBe("succeed")
    expect(mapped.result?.videoUrl).toBe("https://files.heygen.ai/v1.mp4")
    expect(mapped.result?.coverUrl).toBe("https://files.heygen.ai/v1.jpg")
    expect(mapped.result?.duration).toBe(12.5)
    expect(mapped.progress).toBe(100)
  })

  it("failed 同时带出 failure_code（归因）与 failure_message（面向用户）", () => {
    const mapped = mapHeygenVideoToTaskResult({
      id: "v2",
      status: "failed",
      failure_code: "avatar_not_found",
      failure_message: "所选数字人不可用",
    })
    expect(mapped.status).toBe("failed")
    expect(mapped.errorCode).toBe("avatar_not_found")
    expect(mapped.errorMessage).toBe("所选数字人不可用")
  })

  it("failure_message 缺失时给出可读兜底，不把空串抛给用户", () => {
    const mapped = mapHeygenVideoToTaskResult({ id: "v3", status: "failed", failure_code: null })
    expect(mapped.errorMessage).toBeTruthy()
    expect(mapped.errorCode).toBe("HEYGEN_VIDEO_FAILED")
  })

  it("pending / processing 均视为中间态，不得当成功", () => {
    for (const status of ["pending", "processing"] as const) {
      const mapped = mapHeygenVideoToTaskResult({ id: "v4", status })
      expect(mapped.status).toBe("processing")
      expect(mapped.result).toBeUndefined()
    }
  })

  it("completed 但 video_url 为空时不伪造成功产物 URL", () => {
    const mapped = mapHeygenVideoToTaskResult({ id: "v5", status: "completed", video_url: null })
    expect(mapped.status).toBe("succeed")
    expect(mapped.result?.videoUrl).toBeUndefined()
  })
})
