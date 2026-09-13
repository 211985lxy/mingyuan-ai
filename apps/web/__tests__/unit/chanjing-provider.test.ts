import { describe, expect, it } from "vitest"
import {
  mapCustomisedPersonToTaskResult,
  mapVideoToTaskResult,
} from "@/lib/chanjing"

describe("chanjing provider mapping", () => {
  it("maps customised person success to avatar task result", () => {
    const mapped = mapCustomisedPersonToTaskResult({
      id: "C-person-1",
      name: "测试数字人",
      status: 2,
      audio_man_id: "C-audio-1",
      pic_url: "https://example.com/cover.png",
      preview_url: "https://example.com/preview.mp4",
    })

    expect(mapped.status).toBe("succeed")
    expect(mapped.result?.virtualmanId).toBe("C-person-1")
    expect(mapped.result?.speakerId).toBe("C-audio-1")
  })

  it("maps customised person failure", () => {
    const mapped = mapCustomisedPersonToTaskResult({
      id: "C-person-2",
      name: "失败数字人",
      status: 4,
      err_reason: "人脸检测失败",
    })

    expect(mapped.status).toBe("failed")
    expect(mapped.errorMessage).toContain("人脸检测失败")
  })

  it("maps video success to task result", () => {
    const mapped = mapVideoToTaskResult({
      id: "video-1",
      status: 30,
      video_url: "https://example.com/output.mp4",
      preview_url: "https://example.com/cover.jpg",
      duration: 42,
    })

    expect(mapped.status).toBe("succeed")
    expect(mapped.result?.videoUrl).toContain("output.mp4")
    expect(mapped.result?.duration).toBe(42)
  })

  it("maps video failure to task result", () => {
    const mapped = mapVideoToTaskResult({
      id: "video-2",
      status: 50,
      msg: "蝉豆不足",
    })

    expect(mapped.status).toBe("failed")
    expect(mapped.errorMessage).toContain("蝉豆不足")
  })
})
