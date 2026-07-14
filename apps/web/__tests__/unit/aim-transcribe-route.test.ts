import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { authenticateRequest, authErrorResponse, transcribeAudioWav, mockEnv } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  transcribeAudioWav: vi.fn(),
  mockEnv: {
    ALIYUN_NLS_APP_KEY: "test-app-key" as string | undefined,
    ALIYUN_VIAPI_ACCESS_KEY_ID: "test-access-key" as string | undefined,
    ALIYUN_VIAPI_ACCESS_KEY_SECRET: "test-access-secret" as string | undefined,
    OSS_ACCESS_KEY_ID: undefined as string | undefined,
    OSS_ACCESS_KEY_SECRET: undefined as string | undefined,
    SCRIPT_GENERATION_MODEL: undefined as string | undefined,
  },
}))

vi.mock("@/env", () => ({ env: mockEnv }))
vi.mock("@/lib/user-auth", () => ({ authenticateRequest, authErrorResponse }))
vi.mock("@/lib/aliyun-asr", () => ({ transcribeAudioWav }))
vi.mock("@/lib/llm", () => ({
  LLMClient: { shared: () => ({ available: false }) },
}))
vi.mock("@/lib/internal-beta-limits", () => ({
  INTERNAL_BETA_LIMITS: { uploadBytes: 1024 },
}))

import { POST } from "@/app/api/aim/transcribe/route"

function makeRequest(body: Uint8Array) {
  const requestBody = new ArrayBuffer(body.byteLength)
  new Uint8Array(requestBody).set(body)
  return new NextRequest("http://localhost/api/aim/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: requestBody,
  })
}

describe("POST /api/aim/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv.ALIYUN_NLS_APP_KEY = "test-app-key"
    mockEnv.ALIYUN_VIAPI_ACCESS_KEY_ID = "test-access-key"
    mockEnv.ALIYUN_VIAPI_ACCESS_KEY_SECRET = "test-access-secret"
    transcribeAudioWav.mockResolvedValue("测试语音")
  })

  it("rejects an empty audio body", async () => {
    const response = await POST(makeRequest(new Uint8Array()) as never)

    expect(response.status).toBe(400)
    expect(transcribeAudioWav).not.toHaveBeenCalled()
  })

  it("returns a clear unavailable response when ASR is not configured", async () => {
    mockEnv.ALIYUN_NLS_APP_KEY = undefined

    const response = await POST(makeRequest(new Uint8Array([1, 2])) as never)

    expect(response.status).toBe(503)
    expect(transcribeAudioWav).not.toHaveBeenCalled()
  })

  it("transcribes supported audio without entering a media-generation flow", async () => {
    const response = await POST(makeRequest(new Uint8Array([1, 2, 3])) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ text: "测试语音" })
    expect(transcribeAudioWav).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
  })

  it("maps an upstream ASR failure to a gateway error", async () => {
    transcribeAudioWav.mockRejectedValueOnce(new Error("upstream unavailable"))

    const response = await POST(makeRequest(new Uint8Array([1])) as never)

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: "upstream unavailable" })
  })
})
