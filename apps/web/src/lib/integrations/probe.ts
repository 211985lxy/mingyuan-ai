/**
 * 外部集成契约探针（统一框架）。
 *
 * 背景（2026-09 系列事故）：对外部服务的「假设」没有防护网——Fish Audio 上游
 * 新增必填字段、qianfan 生产缺 key、OSS 静默降级，全是用户先撞上才知道。
 * 本模块把「鉴权+端点活着+额度够」做成可定时执行的轻量探针，失败走
 * operational-alerts 现成范式（落库 + 飞书 + fingerprint 去重抑制）。
 *
 * 原则：探针只读、零额度消耗或消耗可忽略；不抛错（每个探针自兜底返回结构化结果）。
 */

import { env } from "@/env"
import { getProviderConfigs } from "@/lib/llm/config"
import { listRoutedModelTargets } from "@/lib/llm/agent-router"
import { getAliyunNlsToken } from "@/lib/aliyun-asr"
import { listVoiceModels } from "@/lib/voice/fish-audio"

export type IntegrationProbeStatus =
  | "healthy"
  | "degraded"
  | "quota_blocked"
  | "unconfigured"
  | "failed"

export interface IntegrationProbeResult {
  name: string
  /** critical=true 的探针 failed 时发飞书告警；degraded 类只落库 */
  critical: boolean
  status: IntegrationProbeStatus
  latencyMs: number
  detail?: string
}

export interface IntegrationProbe {
  name: string
  critical: boolean
  /** 未配置 key 时探针自身返回 unconfigured（不算故障，但要可见） */
  run: () => Promise<{ status: IntegrationProbeStatus; detail?: string }>
}

async function withLatency(run: IntegrationProbe["run"]): Promise<Omit<IntegrationProbeResult, "name" | "critical">> {
  const startedAt = Date.now()
  try {
    const result = await run()
    return { ...result, latencyMs: Date.now() - startedAt }
  } catch (error) {
    return {
      status: "failed",
      detail: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
      latencyMs: Date.now() - startedAt,
    }
  }
}

// ── ali-oss：最危险的静默降级（失败=转存失败→24h 临时链接→资产丢失）；AK 同时被阿里云 ASR 复用 ──

async function probeAliyunOss() {
  if (!env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET || !env.OSS_BUCKET || !env.OSS_REGION) {
    return { status: "unconfigured" as const, detail: "OSS_* 未配置" }
  }
  const { default: OSS } = await import("ali-oss")
  const client = new OSS({
    region: env.OSS_REGION,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
    bucket: env.OSS_BUCKET,
    secure: true,
    timeout: 20_000,
  })
  await client.listV2({ "max-keys": 1 })
  return { status: "healthy" as const }
}

// ── TikHub：竞对分析/选题雷达数据源；402 余额耗尽是高频历史故障 ──

async function probeTikhub() {
  if (!env.TIKHUB_API_KEY) return { status: "unconfigured" as const, detail: "TIKHUB_API_KEY 未配置" }
  // 业务形态探针：/users/me 已被上游下线（2026-09-12 实测 404，与鉴权无关），
  // 改打应用真实在用的搜索端点，故意发非法极简 body——FastAPI 422 = 端点+栈+鉴权链活着
  const response = await fetch("https://api.tikhub.io/api/v1/wechat_search/v2/fetch_search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TIKHUB_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ probe: true }),
    signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 422) return { status: "healthy" as const, detail: "端点与鉴权链健在（校验性 422）" }
  if (response.status === 402) return { status: "quota_blocked" as const, detail: "TikHub 余额不足，竞对/选题数据将 502" }
  if (response.status === 404) return { status: "failed" as const, detail: "业务端点 404（上游已下线/迁移）" }
  return { status: "failed" as const, detail: `HTTP ${response.status}` }
}

// ── 青豆视频文案提取：核心工作流入口；假 batchId 探测区分「key 失效 vs 端点挂」 ──

async function probeQingdou() {
  if (!env.VIDEO_TEXT_EXTRACT_API_KEY) {
    return { status: "unconfigured" as const, detail: "VIDEO_TEXT_EXTRACT_API_KEY 未配置" }
  }
  const response = await fetch("https://www.qingdou.vip/web/api/getTaskResult?batchId=0", {
    headers: { "x-api-key": env.VIDEO_TEXT_EXTRACT_API_KEY },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return { status: "failed" as const, detail: `HTTP ${response.status}` }
  const body = (await response.json().catch(() => null)) as { code?: number | string; message?: string } | null
  // key 失效时上游返回 1004/apikey 类业务码；业务性「任务不存在」= 端点与 key 均健在
  const code = String(body?.code ?? "")
  if (code === "1004" || /api.?key/i.test(body?.message ?? "")) {
    return { status: "failed" as const, detail: "API key 已失效（上游返回鉴权类错误）" }
  }
  return { status: "healthy" as const, detail: "端点与 key 健在（业务性任务不存在响应）" }
}

// ── 阿里云 NLS（语音输入/会议纪要）：CreateToken 零成本验证 AK+端点 ──

async function probeAliyunNls() {
  if (!env.ALIYUN_NLS_APP_KEY || !(env.ALIYUN_VIAPI_ACCESS_KEY_ID || env.OSS_ACCESS_KEY_ID)) {
    return { status: "unconfigured" as const, detail: "ALIYUN_NLS_APP_KEY 或 AK 未配置" }
  }
  await getAliyunNlsToken()
  return { status: "healthy" as const }
}

// ── RedFox：违禁词检测失败会静默降级到 93 词本地库（合规风险）──

async function probeRedfox() {
  if (!env.REDFOX_API_KEY) return { status: "unconfigured" as const, detail: "REDFOX_API_KEY 未配置" }
  const response = await fetch("https://redfox.hk/story/api/cozeSkill/sensitiveWordSearch", {
    method: "POST",
    headers: { "X-API-KEY": env.REDFOX_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "探针测试文本", platform: "douyin" }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return { status: "failed" as const, detail: `HTTP ${response.status}` }
  const body = (await response.json().catch(() => null)) as { code?: number } | null
  if (body?.code !== 2000 && body?.code !== 200) {
    return { status: "failed" as const, detail: `信封 code 异常：${String(body?.code)}` }
  }
  return { status: "healthy" as const }
}

// ── SiliconFlow embedding：纯静默退化（知识召回悄悄变差），主动探测是唯一手段 ──

async function probeSiliconflow() {
  const apiKey = env.EMBEDDING_API_KEY || env.SILICONFLOW_API_KEY
  if (env.EMBEDDING_ENABLED !== "true" || !apiKey) {
    return { status: "unconfigured" as const, detail: "EMBEDDING_ENABLED 未开启或 key 未配置（知识检索处于非语义模式）" }
  }
  // 业务形态探针：/v1/user/info 已 410 下线（2026-09-12 实测），
  // 改打应用真实在用的 embeddings 端点（成本可忽略，且能验证模型名仍有效）
  const response = await fetch("https://api.siliconflow.cn/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "BAAI/bge-large-zh-v1.5", input: ["探针"] }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return { status: "failed" as const, detail: `HTTP ${response.status}` }
  return { status: "healthy" as const }
}

// ── LLM env 漂移：路由表引用的 provider 未注册（qianfan 生产缺失的自动发现） ──

async function probeLlmEnvDrift() {
  const configured = new Set(getProviderConfigs().map((item) => item.name))
  const routed = new Set(listRoutedModelTargets().map((item) => item.provider))
  const missing = [...routed].filter((name) => !configured.has(name))
  if (missing.length) {
    return {
      status: "degraded" as const,
      detail: `路由表引用但未配置 key 的 provider：${missing.join("、")}（对应跳将被静默跳过）`,
    }
  }
  return { status: "healthy" as const }
}

// ── Fish Audio：list 走现有客户端（自带代理与降级语义）──

async function probeFishAudio() {
  if (!env.FISH_AUDIO_API_KEY) return { status: "unconfigured" as const, detail: "FISH_AUDIO_API_KEY 未配置" }
  const { items, degraded, reason } = await listVoiceModels({ selfOnly: true, pageSize: 1 })
  if (degraded) return { status: "failed" as const, detail: reason ?? "list 降级" }
  void items
  return { status: "healthy" as const }
}

export const INTEGRATION_PROBES: IntegrationProbe[] = [
  { name: "ali-oss", critical: true, run: probeAliyunOss },
  { name: "tikhub", critical: true, run: probeTikhub },
  { name: "qingdou-video-extract", critical: true, run: probeQingdou },
  { name: "aliyun-nls", critical: true, run: probeAliyunNls },
  { name: "redfox", critical: true, run: probeRedfox },
  { name: "siliconflow-embedding", critical: false, run: probeSiliconflow },
  { name: "llm-env-drift", critical: true, run: probeLlmEnvDrift },
  { name: "fish-audio", critical: true, run: probeFishAudio },
]

export async function runIntegrationProbes(): Promise<IntegrationProbeResult[]> {
  return Promise.all(
    INTEGRATION_PROBES.map(async (probe) => {
      const result = await withLatency(probe.run)
      return { name: probe.name, critical: probe.critical, ...result }
    }),
  )
}
