import { describe, expect, it } from "vitest"
import {
  buildDigitalHumanVideoPayload,
  classifyChanjingFileStatus,
  mapCustomisedPersonToTaskResult,
  mapVideoToTaskResult,
  waitForFileReady,
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

  it("accepts only file status 1 as ready", () => {
    expect(classifyChanjingFileStatus(0)).toBe("pending")
    expect(classifyChanjingFileStatus(1)).toBe("ready")
    expect(classifyChanjingFileStatus(98)).toBe("failed")
    expect(classifyChanjingFileStatus(99)).toBe("failed")
    expect(classifyChanjingFileStatus(100)).toBe("failed")
  })

  it("waits through pending file states before continuing", async () => {
    const statuses = [0, 0, 1]
    let calls = 0

    await waitForFileReady("file-1", {
      fetchDetail: async () => ({ id: "file-1", status: statuses[calls++] ?? 1 }),
      intervalMs: 1,
      maxAttempts: 3,
      sleep: async () => {},
    })

    expect(calls).toBe(3)
  })

  it("figure_type 仅在有值时写入 person（缺失交供应商判定）", () => {
    const withFigure = buildDigitalHumanVideoPayload({
      personId: "person-1",
      audioManId: "voice-1",
      text: "测试",
      figureType: "sit_body",
    })
    expect((withFigure.person as { figure_type?: string }).figure_type).toBe("sit_body")

    const withoutFigure = buildDigitalHumanVideoPayload({
      personId: "person-1",
      audioManId: "voice-1",
      text: "测试",
      figureType: null,
    })
    // 定制数字人不读该参数；不下发而非传空，避免出现非法空形态
    expect("figure_type" in (withoutFigure.person as Record<string, unknown>)).toBe(false)
  })

  it("drive_mode=random 时下发，否则保持缺省行为", () => {
    const random = buildDigitalHumanVideoPayload({
      personId: "person-1",
      audioManId: "voice-1",
      text: "测试",
      driveMode: "random",
    })
    expect((random.person as { drive_mode?: string }).drive_mode).toBe("random")

    const sequential = buildDigitalHumanVideoPayload({
      personId: "person-1",
      audioManId: "voice-1",
      text: "测试",
      driveMode: null,
    })
    expect("drive_mode" in (sequential.person as Record<string, unknown>)).toBe(false)
  })

  it("marks compliance watermark in the generated video payload", () => {
    const payload = buildDigitalHumanVideoPayload({
      personId: "person-1",
      audioManId: "voice-1",
      text: "这是测试口播",
      width: 1080,
      height: 1920,
    })

    expect(payload).toMatchObject({
      add_compliance_watermark: true,
      screen_width: 1080,
      screen_height: 1920,
      person: { id: "person-1" },
    })
  })
})
