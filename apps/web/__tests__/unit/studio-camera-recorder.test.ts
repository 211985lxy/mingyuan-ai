import { describe, expect, it } from "vitest"
import {
  buildVideoFile,
  formatRecordSeconds,
  pickRecorderMimeType,
  videoFileExtensionFromMimeType,
} from "@/features/studio/camera-recorder"

describe("videoFileExtensionFromMimeType", () => {
  it("mp4 与 webm 分别映射扩展名", () => {
    expect(videoFileExtensionFromMimeType("video/mp4")).toBe(".mp4")
    expect(videoFileExtensionFromMimeType("video/webm;codecs=vp9")).toBe(".webm")
  })
})

describe("buildVideoFile", () => {
  it("按前缀与时间戳命名并保留 mimeType", () => {
    const file = buildVideoFile(new Blob(["x"], { type: "video/mp4" }), "video/mp4", "auth")
    expect(file.name).toMatch(/^auth-\d{8}T?\d*\.mp4$|^auth-\d{4}-\d{2}-\d{2}_?[\d-]*\.mp4$/)
    expect(file.type).toBe("video/mp4")
  })

  it("webm 录制生成 .webm 文件", () => {
    const file = buildVideoFile(new Blob(["x"]), "video/webm;codecs=vp8", "source")
    expect(file.name.endsWith(".webm")).toBe(true)
    expect(file.type).toBe("video/webm")
  })
})

describe("formatRecordSeconds", () => {
  it("分秒补零", () => {
    expect(formatRecordSeconds(0)).toBe("00:00")
    expect(formatRecordSeconds(65)).toBe("01:05")
    expect(formatRecordSeconds(600)).toBe("10:00")
  })
})

describe("pickRecorderMimeType", () => {
  it("无 MediaRecorder 环境回退 webm", () => {
    // node 测试环境无 MediaRecorder，验证回退分支
    const original = globalThis.MediaRecorder
    // @ts-expect-error -- 测试删除全局构造器
    delete globalThis.MediaRecorder
    expect(pickRecorderMimeType()).toBe("video/webm")
    globalThis.MediaRecorder = original
  })
})
