import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"

type FishAudioModule = typeof import("@/lib/voice/fish-audio")

const ORIGINAL_KEY = process.env.FISH_AUDIO_API_KEY

async function loadClient(): Promise<FishAudioModule> {
  vi.resetModules()
  return import("@/lib/voice/fish-audio")
}

function stubFetchOnce(impl: (input: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    impl(String(input), init),
  )
  vi.stubGlobal("fetch", spy as unknown as typeof fetch)
  return spy
}

beforeEach(() => {
  process.env.FISH_AUDIO_API_KEY = "test-key"
  delete process.env.FISH_AUDIO_BASE_URL
  delete process.env.FISH_AUDIO_MODEL
  delete process.env.FISH_AUDIO_PROXY_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_KEY === undefined) delete process.env.FISH_AUDIO_API_KEY
  else process.env.FISH_AUDIO_API_KEY = ORIGINAL_KEY
})

describe("Fish Audio TTS 客户端", () => {
  it("未配置密钥时直接拒绝，不发起外部请求", async () => {
    delete process.env.FISH_AUDIO_API_KEY
    const { synthesizeSpeech, FishAudioError } = await loadClient()
    const spy = stubFetchOnce(async () => new Response("never", { status: 200 }))

    await expect(synthesizeSpeech({ text: "你好" })).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 })
    expect(spy).not.toHaveBeenCalled()
    expect(FishAudioError).toBeDefined()
  })

  it("空文本与超长文本在本地被拦下", async () => {
    const { synthesizeSpeech, FISH_AUDIO_MAX_TEXT_LENGTH } = await loadClient()
    const spy = stubFetchOnce(async () => new Response("x", { status: 200 }))

    await expect(synthesizeSpeech({ text: "   " })).rejects.toMatchObject({ code: "EMPTY_TEXT" })
    await expect(synthesizeSpeech({ text: "啊".repeat(FISH_AUDIO_MAX_TEXT_LENGTH + 1) })).rejects.toMatchObject({
      code: "TEXT_TOO_LONG",
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it("默认走免费档，并把档位与音色透传给上游", async () => {
    const { synthesizeSpeech } = await loadClient()
    const spy = stubFetchOnce(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } }),
    )

    const result = await synthesizeSpeech({ text: "暖气片一半热一半凉", voiceId: "voice-1" })

    expect(result.model).toBe("s2.1-pro-free")
    expect(result.voiceId).toBe("voice-1")
    expect(result.contentType).toBe("audio/mpeg")
    expect(result.charCount).toBe(9)

    const [, init] = spy.mock.calls[0]
    expect(String(spy.mock.calls[0][0])).toBe("https://api.fish.audio/v1/tts")
    expect((init?.headers as Record<string, string>).model).toBe("s2.1-pro-free")
    expect(JSON.parse(String(init?.body))).toMatchObject({ text: "暖气片一半热一半凉", reference_id: "voice-1", format: "mp3" })
  })

  it("配置 FISH_AUDIO_PROXY_URL 时请求携带共享 dispatcher，未配置则直连", async () => {
    process.env.FISH_AUDIO_PROXY_URL = "http://127.0.0.1:10808"
    const { synthesizeSpeech } = await loadClient()
    const spy = stubFetchOnce(async () => new Response(new Uint8Array([1]), { status: 200 }))

    await synthesizeSpeech({ text: "你好" })

    const [, init] = spy.mock.calls[0]
    expect((init as RequestInit & { dispatcher?: unknown }).dispatcher).toBeDefined()

    delete process.env.FISH_AUDIO_PROXY_URL
    const direct = await loadClient()
    const directSpy = stubFetchOnce(async () => new Response(new Uint8Array([1]), { status: 200 }))
    await direct.synthesizeSpeech({ text: "你好" })
    const [, directInit] = directSpy.mock.calls[0]
    expect((directInit as RequestInit & { dispatcher?: unknown }).dispatcher).toBeUndefined()
  })

  it("上游鉴权失败被翻译成可行动提示，不泄漏原文", async () => {
    const { synthesizeSpeech } = await loadClient()
    stubFetchOnce(async () => new Response("secret leak detail", { status: 401 }))

    await expect(synthesizeSpeech({ text: "你好" })).rejects.toMatchObject({ status: 401 })
    await expect(synthesizeSpeech({ text: "你好" })).rejects.toThrow(/FISH_AUDIO_API_KEY/)
  })

  it("音色列表映射上游字段，上游失败时降级不抛错", async () => {
    const { listVoiceModels } = await loadClient()
    stubFetchOnce(
      async () =>
        new Response(
          JSON.stringify({ items: [{ _id: "m1", title: "知性女声", languages: ["zh"] }, { _id: "", title: "无效" }] }),
          { status: 200 },
        ),
    )
    const ok = await listVoiceModels({ selfOnly: true })
    expect(ok.degraded).toBe(false)
    expect(ok.items).toEqual([{ id: "m1", title: "知性女声", description: undefined, languages: ["zh"] }])

    stubFetchOnce(async () => new Response("boom", { status: 500 }))
    const failed = await listVoiceModels()
    expect(failed.items).toEqual([])
    expect(failed.degraded).toBe(true)
    expect(failed.reason).toContain("500")
  })
})

describe("长文分段切分 splitTextForSynthesis", () => {
  it("短文与空文本直通", () => {
    expect(splitTextForSynthesis("")).toEqual([])
    expect(splitTextForSynthesis("   ")).toEqual([])
    expect(splitTextForSynthesis("大家好，今天聊聊暖气片。")).toEqual(["大家好，今天聊聊暖气片。"])
  })

  it("按句子边界切分且不丢字、不超上限", async () => {
    const { FISH_AUDIO_MAX_TEXT_LENGTH } = await loadClient()
    const sentence = "暖气片一半热一半凉，到底是为什么？"
    const text = sentence.repeat(300) // 5100 字，必然超单段上限
    const segments = splitTextForSynthesis(text)
    expect(segments.length).toBeGreaterThan(1)
    for (const segment of segments) {
      expect(segment.length).toBeLessThanOrEqual(1200)
    }
    expect(segments.join("")).toBe(text)
    expect(text.length).toBeGreaterThan(FISH_AUDIO_MAX_TEXT_LENGTH)
  })

  it("无断句符的超长单句按硬上限兜底切分", () => {
    const text = "啊".repeat(5000)
    const segments = splitTextForSynthesis(text)
    expect(segments.length).toBe(5)
    expect(segments.slice(0, 4).map((segment) => segment.length)).toEqual([1200, 1200, 1200, 1200])
    expect(segments[4].length).toBe(200)
    expect(segments.join("")).toBe(text)
  })
})

describe("Fish Audio 声音克隆", () => {
  it("克隆请求必须携带 train_mode=fast（上游 422 Field required 回归）", async () => {
    process.env.FISH_AUDIO_API_KEY = "test-fish-key"
    vi.resetModules()
    const { cloneVoiceModel } = await import("@/lib/voice/fish-audio")
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ _id: "model-1" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await cloneVoiceModel({
      title: "我的音色",
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
      filename: "sample.mp3",
    })

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/model"))
    expect(call).toBeDefined()
    const form = call![1].body as FormData
    expect(form.get("train_mode")).toBe("fast")
    expect(form.get("type")).toBe("tts")
    expect(form.get("visibility")).toBe("private")
    vi.unstubAllGlobals()
  })
})
