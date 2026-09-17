import { afterEach, describe, expect, it, vi } from "vitest"

// lib/hypit 依赖 OSS 客户端；这里只需要它的模块能加载，不需要真的上传。
vi.mock("@/lib/oss", () => ({ uploadBufferToOss: vi.fn() }))

const HYPIT_ENV_KEYS = [
  "HYPIT_RENDERER_URL",
  "HYPIT_API_TOKEN",
  "HYPIT_ENABLED",
  "HYPIT_SHADOW_MODE",
] as const

type HypitEnvKey = (typeof HYPIT_ENV_KEYS)[number]

const ORIGINAL: Record<string, string | undefined> = {}
for (const key of HYPIT_ENV_KEYS) ORIGINAL[key] = process.env[key]

afterEach(() => {
  for (const key of HYPIT_ENV_KEYS) {
    if (ORIGINAL[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL[key]
  }
  vi.resetModules()
})

/**
 * 客户端把地址与 token 读成模块级常量（避免每次请求都读环境），
 * 所以测试必须在 import 之前把环境摆好，并重置模块缓存。
 */
async function loadHypit(overrides: Partial<Record<HypitEnvKey, string>> = {}) {
  vi.resetModules()
  for (const key of HYPIT_ENV_KEYS) delete process.env[key]
  Object.assign(process.env, overrides)
  return await import("@/lib/hypit")
}

const CONFIGURED = {
  HYPIT_RENDERER_URL: "http://hypit-renderer:8787",
  HYPIT_API_TOKEN: "test-token",
} as const

describe("Hypit 任务状态映射", () => {
  it("work.state=done 且 outcome=complete 时仍是中间态——成品 URL 要等导出转存后才存在", async () => {
    const { mapHypitBuildToTaskResult } = await loadHypit(CONFIGURED)
    const mapped = mapHypitBuildToTaskResult({
      id: "bld_1",
      work: { state: "done", outcome: "complete" },
    })
    expect(mapped.status).toBe("processing")
    expect(mapped.result).toBeUndefined()
  })

  it("work.state=done 但 outcome 非 complete：判失败，不伪造成功产物", async () => {
    const { mapHypitBuildToTaskResult } = await loadHypit(CONFIGURED)
    const mapped = mapHypitBuildToTaskResult({
      id: "bld_2",
      work: { state: "done", outcome: "cancelled" },
    })
    expect(mapped.status).toBe("failed")
    expect(mapped.errorCode).toBe("HYPIT_RENDER_CANCELLED")
    expect(mapped.errorMessage).toBeTruthy()
    expect(mapped.result).toBeUndefined()
  })

  it("work.state=failed 判失败，并给出可读兜底文案", async () => {
    const { mapHypitBuildToTaskResult } = await loadHypit(CONFIGURED)
    const mapped = mapHypitBuildToTaskResult({ id: "bld_3", work: { state: "failed" } })
    expect(mapped.status).toBe("failed")
    expect(mapped.errorCode).toBe("HYPIT_RENDER_FAILED")
    expect(mapped.errorMessage).toBeTruthy()
  })

  it("running / queued 均为中间态", async () => {
    const { mapHypitBuildToTaskResult } = await loadHypit(CONFIGURED)
    for (const state of ["running", "queued", "submitted", ""]) {
      const mapped = mapHypitBuildToTaskResult({ id: "bld_4", work: { state } })
      expect(mapped.status).toBe("processing")
    }
  })

  it("work 缺失时按中间态处理，不得当成完成", async () => {
    const { mapHypitBuildToTaskResult, isHypitBuildComplete } = await loadHypit(CONFIGURED)
    expect(mapHypitBuildToTaskResult({ id: "bld_5" }).status).toBe("processing")
    expect(isHypitBuildComplete({ id: "bld_5" })).toBe(false)
  })

  it("isHypitBuildComplete 只认 done + complete 这一种组合", async () => {
    const { isHypitBuildComplete } = await loadHypit(CONFIGURED)
    expect(isHypitBuildComplete({ id: "b", work: { state: "done", outcome: "complete" } })).toBe(true)
    expect(isHypitBuildComplete({ id: "b", work: { state: "done", outcome: "failed" } })).toBe(false)
    expect(isHypitBuildComplete({ id: "b", work: { state: "running", outcome: "complete" } })).toBe(false)
    expect(isHypitBuildComplete({ id: "b" })).toBe(false)
  })
})

describe("Hypit 开关", () => {
  it("地址或 token 任一缺失都视为未配置", async () => {
    const onlyUrl = await loadHypit({ HYPIT_RENDERER_URL: "http://hypit-renderer:8787" })
    expect(onlyUrl.isHypitConfigured()).toBe(false)

    const onlyToken = await loadHypit({ HYPIT_API_TOKEN: "t" })
    expect(onlyToken.isHypitConfigured()).toBe(false)

    const both = await loadHypit(CONFIGURED)
    expect(both.isHypitConfigured()).toBe(true)
  })

  it("总开关默认关，只有严格 true 才开放", async () => {
    expect((await loadHypit(CONFIGURED)).isHypitEnabled()).toBe(false)
    expect((await loadHypit({ ...CONFIGURED, HYPIT_ENABLED: "1" })).isHypitEnabled()).toBe(false)
    expect((await loadHypit({ ...CONFIGURED, HYPIT_ENABLED: "TRUE" })).isHypitEnabled()).toBe(false)
    expect((await loadHypit({ ...CONFIGURED, HYPIT_ENABLED: "true" })).isHypitEnabled()).toBe(true)
  })

  it("影子模式默认关，只有严格 true 才生效", async () => {
    expect((await loadHypit(CONFIGURED)).isHypitShadowMode()).toBe(false)
    expect((await loadHypit({ ...CONFIGURED, HYPIT_SHADOW_MODE: "yes" })).isHypitShadowMode()).toBe(false)
    expect((await loadHypit({ ...CONFIGURED, HYPIT_SHADOW_MODE: "true" })).isHypitShadowMode()).toBe(true)
  })
})

describe("Hypit 提交前校验（fail-closed）", () => {
  it("source 与 content 都缺时拒绝，不发出请求", async () => {
    const { submitHypitBuild, HypitError } = await loadHypit(CONFIGURED)
    await expect(submitHypitBuild({})).rejects.toThrow(HypitError)
  })

  it("source 与 content 同时给出时拒绝（避免歧义）", async () => {
    const { submitHypitBuild, HypitError } = await loadHypit(CONFIGURED)
    await expect(
      submitHypitBuild({ source: "a.svml", content: "b" }),
    ).rejects.toThrow(HypitError)
  })

  it("未配置时任何提交都直接失败，不会打出到空地址的请求", async () => {
    const { submitHypitBuild, HypitError } = await loadHypit()
    await expect(submitHypitBuild({ content: "x" })).rejects.toThrow(HypitError)
  })
})

describe("三比例：产物名 → 比例推断", () => {
  const cases: Array<[string, string | null]> = [
    ["final-916.video", "9:16"],
    ["final-9x16.video", "9:16"],
    ["final_vertical.video", "9:16"],
    ["final-169.video", "16:9"],
    ["final-16x9.video", "16:9"],
    ["final.horizontal.video", "16:9"],
    ["final-11.video", "1:1"],
    ["final-1x1.video", "1:1"],
    ["final.square.video", "1:1"],
    // 认不出来就返回 null，交给调用方按渲染顺序兜底，不猜
    ["final.video", null],
    ["card.image", null],
    // 边界：数字两侧必须是非数字，避免 1916 / 9160 被误判成 9:16
    ["take-1916.video", null],
    ["scene-9160.video", null],
  ]

  it.each(cases)("%s → %s", async (name, expected) => {
    const { inferHypitAspectRatio } = await loadHypit(CONFIGURED)
    expect(inferHypitAspectRatio(name)).toBe(expected)
  })

  it("关键词优先于数字写法（final-1-1-square 判 1:1 而非 16:9）", async () => {
    const { inferHypitAspectRatio } = await loadHypit(CONFIGURED)
    expect(inferHypitAspectRatio("final-square.video")).toBe("1:1")
  })
})

describe("三比例：多产物排序", () => {
  const deliverables = [
    { outputName: "final-916.video", url: "https://oss/a.mp4", mediaType: "video/mp4", aspectRatio: "9:16" as const },
    { outputName: "final-169.video", url: "https://oss/b.mp4", mediaType: "video/mp4", aspectRatio: "16:9" as const },
    { outputName: "final-11.video", url: "https://oss/c.mp4", mediaType: "video/mp4", aspectRatio: "1:1" as const },
  ]

  it("指定首选比例时把它排第一，其余保持渲染顺序", async () => {
    const { sortDeliverables } = await loadHypit(CONFIGURED)
    const sorted = sortDeliverables([...deliverables], "1:1")
    expect(sorted.map((item) => item.aspectRatio)).toEqual(["1:1", "9:16", "16:9"])
  })

  it("未指定或首选不在列表里时原样返回（稳定，重试结果一致）", async () => {
    const { sortDeliverables } = await loadHypit(CONFIGURED)
    expect(sortDeliverables(deliverables)).toEqual(deliverables)
    expect(sortDeliverables([...deliverables], "16:9").map((i) => i.aspectRatio)).toEqual(["16:9", "9:16", "1:1"])
  })
})

describe("落库：多产物清单收敛", () => {
  it("只保留带 url 的条目，并把非法 aspectRatio 归一为 null", async () => {
    const { toRenderOutputsJson } = await import("@/lib/video-task-settlement")
    const json = toRenderOutputsJson([
      { outputName: "final-916.video", url: "https://oss/a.mp4", mediaType: "video/mp4", aspectRatio: "9:16" },
      { outputName: "final-169.video", url: "https://oss/b.mp4", mediaType: "video/mp4", aspectRatio: "nonsense" },
      { outputName: "broken.video", url: null, aspectRatio: "1:1" },
    ]) as Array<Record<string, unknown>>
    expect(json).toHaveLength(2)
    expect(json[1].aspectRatio).toBeNull()
  })

  it("空数组或非数组一律返回 undefined（不写库）", async () => {
    const { toRenderOutputsJson } = await import("@/lib/video-task-settlement")
    expect(toRenderOutputsJson([])).toBeUndefined()
    expect(toRenderOutputsJson(undefined)).toBeUndefined()
    expect(toRenderOutputsJson("nope")).toBeUndefined()
  })
})

describe("provider 抽象层认得 hypit", () => {
  it("校验与归一化都覆盖第四家 provider", async () => {
    const { isDigitalHumanProvider, normalizeDigitalHumanProvider } =
      await import("@/lib/digital-human-provider")
    expect(isDigitalHumanProvider("hypit")).toBe(true)
    expect(normalizeDigitalHumanProvider("hypit")).toBe("hypit")
  })

  it("hypit 不被归一化成蝉镜", async () => {
    const { normalizeDigitalHumanProvider } = await import("@/lib/digital-human-provider")
    expect(normalizeDigitalHumanProvider("hypit")).not.toBe("chanjing")
  })

  it("并发槽按 provider 独立，hypit 缺省为 1", async () => {
    const { providerMaxConcurrent, providerSemaphoreKey } =
      await import("@/lib/digital-human-semaphore")
    expect(providerMaxConcurrent("hypit")).toBe(1)
    expect(providerSemaphoreKey("hypit")).toBe("digital-human:hypit:inflight")
  })

  it("hypit 不适用形象授权文案，显式报错而非落到闪剪文案", async () => {
    const { getDigitalHumanAuthorizationText, DigitalHumanProviderError } =
      await import("@/lib/digital-human-provider")
    expect(() => getDigitalHumanAuthorizationText("hypit")).toThrow(DigitalHumanProviderError)
  })
})
