import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, authErrorResponse, isManagedOssUrl, generateSignedUrl, transcribeRecordingFile } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
    authErrorResponse: vi.fn(() => null),
    isManagedOssUrl: vi.fn((url: string) => url.startsWith("https://managed-oss.example/")),
    generateSignedUrl: vi.fn((url: string) => `https://signed.example/${encodeURIComponent(url)}`),
    transcribeRecordingFile: vi.fn(async () => ({
      taskId: "task-1",
      readableTranscript: "发言人A: 这是第一句\n发言人B: 这是第二句",
      segments: [],
      stats: { segmentCount: 2, speakerCount: 2, durationSec: 30, totalChars: 20 },
    })),
  }))

vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/oss", () => ({ isManagedOssUrl, generateSignedUrl }))
vi.mock("@/lib/aliyun-asr", () => ({ transcribeRecordingFile }))

import { POST } from "@/app/api/aim/attachment-transcribe/route"

function jsonRequest(body: unknown) {
  return new NextRequest("http://localhost/api/aim/attachment-transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("aim attachment-transcribe route（音频自动转写）", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
  })

  it("缺 audioUrl 拒绝（400）", async () => {
    const response = await POST(jsonRequest({}))
    expect(response.status).toBe(400)
    expect(transcribeRecordingFile).not.toHaveBeenCalled()
  })

  it("托管 OSS URL 先签名再转写，成功返回文本（200）", async () => {
    const response = await POST(jsonRequest({ audioUrl: "https://managed-oss.example/a.m4a" }))
    expect(response.status).toBe(200)
    expect(generateSignedUrl).toHaveBeenCalledWith("https://managed-oss.example/a.m4a", 3600)
    expect(transcribeRecordingFile).toHaveBeenCalledTimes(1)
    const data = await response.json()
    expect(data.text).toContain("第一句")
  })

  it("非托管 URL 原样交给 ASR（与 meeting-recording 一致）", async () => {
    const response = await POST(jsonRequest({ audioUrl: "https://external.example/b.wav" }))
    expect(response.status).toBe(200)
    expect(transcribeRecordingFile).toHaveBeenCalledWith("https://external.example/b.wav")
  })

  it("无识别文本拒绝（422）", async () => {
    transcribeRecordingFile.mockResolvedValueOnce({
      taskId: "t", readableTranscript: "   ", segments: [],
      stats: { segmentCount: 0, speakerCount: 0, durationSec: 0, totalChars: 0 },
    })
    const response = await POST(jsonRequest({ audioUrl: "https://external.example/silence.wav" }))
    expect(response.status).toBe(422)
  })

  it("ASR 抛错返回 502", async () => {
    transcribeRecordingFile.mockRejectedValueOnce(new Error("阿里云超时"))
    const response = await POST(jsonRequest({ audioUrl: "https://external.example/x.wav" }))
    expect(response.status).toBe(502)
  })
})
