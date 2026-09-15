import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCreateVideoTaskInput,
  resolveVideoWorkbenchInit,
  validateVideoSubmission,
} from "@/features/studio/video-workbench-data"
import { clearVideoHandoff, saveVideoHandoff } from "@/lib/studio/studio-prefs"

/** studio-prefs 只在 window 存在时读写；node 环境注入最小存储替身。 */
function stubStorages() {
  const store = new Map<string, string>()
  const impl = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal("window", { localStorage: impl, sessionStorage: impl })
  return store
}

function params(entries: Record<string, string>) {
  return new URLSearchParams(entries)
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearVideoHandoff()
})

describe("resolveVideoWorkbenchInit", () => {
  it("空参数返回零配置默认值并清理残留交接", () => {
    stubStorages()
    saveVideoHandoff({ script: "旧文案" })
    const init = resolveVideoWorkbenchInit(params({}))
    expect(init.script).toBe("")
    expect(init.projectId).toBe("")
    expect(init.voiceSource).toBeNull()
    expect(init.fishVoiceId).toBe("default")
    expect(init.aspectRatio).toBe("9:16")
    expect(init.startAtScript).toBe(false)
    expect(init.clearHandoff).toBe(true)
  })

  it("AIM 深链携带文案与项目时直达第 2 步且保留交接", () => {
    stubStorages()
    const init = resolveVideoWorkbenchInit(
      params({ script: "口播稿", projectId: "p1", aimGenerationId: "g1", from: "aim" }),
    )
    expect(init.script).toBe("口播稿")
    expect(init.projectId).toBe("p1")
    expect(init.startAtScript).toBe(true)
    expect(init.aimGenerationId).toBe("g1")
    expect(init.clearHandoff).toBe(false)
  })

  it("voiceId 参数切换为我的克隆音色", () => {
    stubStorages()
    const init = resolveVideoWorkbenchInit(params({ voiceId: "fish-1" }))
    expect(init.voiceSource).toBe("own_voice")
    expect(init.fishVoiceId).toBe("fish-1")
  })

  it("works 重新编辑：sessionStorage 交接的文案与项目生效", () => {
    stubStorages()
    saveVideoHandoff({ script: "历史文案", projectId: "p9" })
    const init = resolveVideoWorkbenchInit(params({ from: "works" }))
    expect(init.script).toBe("历史文案")
    expect(init.projectId).toBe("p9")
    expect(init.startAtScript).toBe(true)
    expect(init.clearHandoff).toBe(false)
  })

  it("未知 from 来源视为直达访问，残留交接不生效", () => {
    stubStorages()
    saveVideoHandoff({ script: "旧文案" })
    const init = resolveVideoWorkbenchInit(params({ from: "somewhere" }))
    expect(init.script).toBe("")
    expect(init.startAtScript).toBe(false)
    expect(init.clearHandoff).toBe(true)
  })

  it("无深链参数时回退上次偏好", () => {
    const store = stubStorages()
    store.set(
      "studio-video-prefs",
      JSON.stringify({ projectId: "p-last", fishVoiceId: "fish-last", aspectRatio: "16:9" }),
    )
    const init = resolveVideoWorkbenchInit(params({}))
    expect(init.projectId).toBe("p-last")
    expect(init.fishVoiceId).toBe("fish-last")
    expect(init.aspectRatio).toBe("16:9")
  })
})

describe("validateVideoSubmission", () => {
  const base = {
    script: "正文",
    avatarSource: "mine" as const,
    selectedAvatarId: "a1",
    selectedPublic: null,
    publicVoiceId: null,
    projectId: "p1",
  }

  it("自建形象齐全时通过", () => {
    expect(validateVideoSubmission(base)).toBeNull()
  })

  it("空文案拦截", () => {
    expect(validateVideoSubmission({ ...base, script: "  " })).toBe("请先确认口播文案")
  })

  it("自建形象未选择拦截", () => {
    expect(validateVideoSubmission({ ...base, selectedAvatarId: "" })).toBe("请选择一个可用数字人")
  })

  it("公共形象缺音色拦截", () => {
    const result = validateVideoSubmission({
      ...base,
      avatarSource: "public",
      selectedAvatarId: "",
      selectedPublic: { id: "v1" },
      publicVoiceId: null,
    })
    expect(result).toBe("该形象暂无可用音色，请稍后重试或换一个形象")
  })

  it("缺客户项目拦截", () => {
    expect(validateVideoSubmission({ ...base, projectId: "" })).toBe("请先选择一个客户项目")
  })
})

describe("buildCreateVideoTaskInput", () => {
  const base = {
    projectId: "p1",
    avatarSource: "mine" as const,
    selectedAvatarId: "a1",
    selectedPublic: null,
    publicVoiceId: null,
    script: "正文",
    aspectRatio: "9:16" as const,
    voiceSource: "tts" as const,
    fishVoiceId: "default",
    aimGenerationId: null,
  }

  it("自建数字人走 avatarId，配套音色不带 voiceSource", () => {
    const payload = buildCreateVideoTaskInput({ ...base, avatarSource: "mine" })
    expect(payload).toMatchObject({
      type: "virtualman_broadcast",
      projectId: "p1",
      avatarId: "a1",
      scriptContent: "正文",
      aspectRatio: "9:16",
    })
    expect(payload.voiceSource).toBeUndefined()
    expect(payload.aimGenerationId).toBeUndefined()
  })

  it("公共数字人带供应商形象与音色 id", () => {
    const payload = buildCreateVideoTaskInput({
      ...base,
      avatarSource: "public",
      selectedAvatarId: "",
      selectedPublic: { id: "v1", name: "公共形象" },
      publicVoiceId: "speaker-1",
    })
    expect(payload).toMatchObject({
      virtualmanId: "v1",
      speakerId: "speaker-1",
      avatarName: "公共形象",
    })
    expect("avatarId" in payload).toBe(false)
  })

  it("我的克隆音色时携带 voiceSource，默认音色不带 voiceId", () => {
    const payload = buildCreateVideoTaskInput({ ...base, voiceSource: "own_voice" })
    expect(payload.voiceSource).toBe("own_voice")
    expect(payload.voiceId).toBeUndefined()

    const withVoice = buildCreateVideoTaskInput({
      ...base,
      voiceSource: "own_voice",
      fishVoiceId: "fish-9",
    })
    expect(withVoice.voiceId).toBe("fish-9")
  })

  it("AIM 生成 id 透传", () => {
    const payload = buildCreateVideoTaskInput({ ...base, aimGenerationId: "g1" })
    expect(payload.aimGenerationId).toBe("g1")
  })
})
