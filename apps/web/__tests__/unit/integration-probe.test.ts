import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * 集成探针框架测试：聚焦可离线验证的分支（未配置/env 漂移/fetch 失败兜底）。
 * healthy 路径依赖真实上游，由部署时的实环境探针覆盖，不在单测范围。
 */

const CLEAN_ENV = {
  OSS_ACCESS_KEY_ID: undefined as string | undefined,
  OSS_ACCESS_KEY_SECRET: undefined as string | undefined,
  OSS_BUCKET: undefined as string | undefined,
  OSS_REGION: undefined as string | undefined,
  TIKHUB_API_KEY: undefined as string | undefined,
  VIDEO_TEXT_EXTRACT_API_KEY: undefined as string | undefined,
  ALIYUN_NLS_APP_KEY: undefined as string | undefined,
  REDFOX_API_KEY: undefined as string | undefined,
  EMBEDDING_ENABLED: undefined as string | undefined,
  EMBEDDING_API_KEY: undefined as string | undefined,
  SILICONFLOW_API_KEY: undefined as string | undefined,
  FISH_AUDIO_API_KEY: undefined as string | undefined,
  ALIYUN_SMS_ACCESS_KEY_ID: undefined as string | undefined,
  ALIYUN_SMS_ACCESS_KEY_SECRET: undefined as string | undefined,
  SMS_SIGN_NAME: undefined as string | undefined,
  FEISHU_APP_ID: undefined as string | undefined,
  FEISHU_APP_SECRET: undefined as string | undefined,
  FEISHU_BOT_CONTENT_PRODUCER_APP_ID: undefined as string | undefined,
  FEISHU_BOT_CONTENT_PRODUCER_APP_SECRET: undefined as string | undefined,
  BACKGROUND_TASKS_ENABLED: undefined as string | undefined,
}

async function loadProbesWithEnv(extra: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...CLEAN_ENV, ...extra })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const mod = await import("@/lib/integrations/probe")
  return mod
}

function findByName(results: Awaited<ReturnType<typeof import("@/lib/integrations/probe").runIntegrationProbes>>, name: string) {
  return results.find((r) => r.name === name)
}

describe("集成探针框架", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("全部 key 缺失时探针返回 unconfigured 而不是 failed", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({})
    const results = await runIntegrationProbes()
    for (const name of ["ali-oss", "tikhub", "qingdou-video-extract", "aliyun-nls", "redfox", "siliconflow-embedding", "fish-audio", "aliyun-sms", "feishu-bots"]) {
      expect(findByName(results, name)?.status, name).toBe("unconfigured")
    }
  })

  it("探针永不抛错：fetch 网络异常兜底为 failed", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({
      TIKHUB_API_KEY: "test-key",
      REDFOX_API_KEY: "test-key",
      VIDEO_TEXT_EXTRACT_API_KEY: "test-key",
    })
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    }))
    const results = await runIntegrationProbes()
    expect(findByName(results, "tikhub")?.status).toBe("failed")
    expect(findByName(results, "redfox")?.status).toBe("failed")
    expect(findByName(results, "qingdou-video-extract")?.status).toBe("failed")
    // 每个结果都带耗时
    for (const result of results) expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("TikHub 402 归为 quota_blocked 而不是 failed", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({ TIKHUB_API_KEY: "test-key" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("insufficient", { status: 402 })))
    const results = await runIntegrationProbes()
    expect(findByName(results, "tikhub")?.status).toBe("quota_blocked")
  })

  it("TikHub 校验性 422 归为 healthy（业务端点+鉴权链健在）", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({ TIKHUB_API_KEY: "test-key" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: [] }), { status: 422 })))
    const results = await runIntegrationProbes()
    expect(findByName(results, "tikhub")?.status).toBe("healthy")
  })

  it("TikHub 业务端点 404 判为 failed（上游下线，2026-09-12 实测）", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({ TIKHUB_API_KEY: "test-key" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not Found", { status: 404 })))
    const results = await runIntegrationProbes()
    expect(findByName(results, "tikhub")?.status).toBe("failed")
  })

  it("qingdou：业务性「任务不存在」响应判定为 healthy（端点与 key 健在）", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({ VIDEO_TEXT_EXTRACT_API_KEY: "test-key" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 0, message: "task not found" }), { status: 200 })))
    const results = await runIntegrationProbes()
    expect(findByName(results, "qingdou-video-extract")?.status).toBe("healthy")
  })

  it("qingdou：1004/apikey 类响应判定为 failed（key 失效）", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({ VIDEO_TEXT_EXTRACT_API_KEY: "expired-key" })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 1004, message: "invalid api key" }), { status: 200 })))
    const results = await runIntegrationProbes()
    expect(findByName(results, "qingdou-video-extract")?.status).toBe("failed")
  })

  it("env 漂移：路由表引用但未注册的 provider 被点名（qianfan 案例）", async () => {
    const { runIntegrationProbes } = await loadProbesWithEnv({})
    const results = await runIntegrationProbes()
    const drift = findByName(results, "llm-env-drift")
    // 生产模板缺 QIANFAN_API_KEY：free_copywriter 首跳被静默跳过的自动发现
    expect(drift?.status).toBe("degraded")
    expect(drift?.detail).toContain("qianfan")
  })

  it("critical 标记存在且探针数量稳定（防误删）", async () => {
    const { INTEGRATION_PROBES } = await loadProbesWithEnv({})
    const names = INTEGRATION_PROBES.map((p) => p.name)
    for (const name of ["ali-oss", "tikhub", "qingdou-video-extract", "aliyun-nls", "redfox", "siliconflow-embedding", "llm-env-drift", "fish-audio", "aliyun-sms", "feishu-bots"]) {
      expect(names, name).toContain(name)
    }
    expect(INTEGRATION_PROBES.every((p) => typeof p.critical === "boolean")).toBe(true)
  })
})
