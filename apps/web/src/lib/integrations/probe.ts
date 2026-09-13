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
import { createHmac } from "node:crypto"
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

// ── 阿里云短信：QuerySmsSign 只读探测（不发短信、不计费）。
//    RAM 当前只授了 SendSms——未授权 QuerySmsSign 时报「待授权」而非故障，
//    实际发送路径（SendSms 已授权）不受影响。 ──

async function probeAliyunSms() {
  const accessKeyId = env.ALIYUN_SMS_ACCESS_KEY_ID
  const accessKeySecret = env.ALIYUN_SMS_ACCESS_KEY_SECRET
  const signName = env.SMS_SIGN_NAME
  if (!accessKeyId || !accessKeySecret || !signName) {
    return { status: "unconfigured" as const, detail: "ALIYUN_SMS_* / SMS_SIGN_NAME 未配置" }
  }
  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "QuerySmsSign",
    Format: "JSON",
    RegionId: "cn-hangzhou",
    // QuerySmsSign 的 SignName 是必填项：漏传时阿里云返回
    // 「MissingSignName SignName is mandatory for this action」，
    // 会被下面判成 failed（而发送路径其实是好的）。
    SignName: signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  }
  const canonicalized = Object.keys(params).sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!)}`)
    .join("&")
  params.Signature = createHmac("sha1", `${accessKeySecret}&`)
    .update(`POST&${encodeURIComponent("/")}&${encodeURIComponent(canonicalized)}`, "utf8")
    .digest("base64")
  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
    .join("&")
  const response = await fetch("https://dysmsapi.aliyuncs.com", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  const result = (await response.json().catch(() => null)) as { Code?: string; Message?: string } | null
  if (response.ok && result?.Code === "OK") return { status: "healthy" as const }
  const code = result?.Code ?? `HTTP ${response.status}`
  if (/forbidden|denied|nopermission|not.?authorized|isnotexist/i.test(code)) {
    return {
      status: "degraded" as const,
      detail: `RAM 尚未授权 QuerySmsSign 只读权限（${code}）——探针待授权；实际发码路径（SendSms）不受影响`,
    }
  }
  return { status: "failed" as const, detail: `${code} ${result?.Message ?? ""}`.trim().slice(0, 160) }
}

// ── 飞书多 bot：逐个验证 tenant_access_token（零成本）；联动报告后台任务开关 ──

async function probeFeishuBots() {
  const apps: Array<{ label: string; appId?: string; secret?: string }> = [
    { label: "主应用", appId: env.FEISHU_APP_ID, secret: env.FEISHU_APP_SECRET },
    { label: "content_producer", appId: env.FEISHU_BOT_CONTENT_PRODUCER_APP_ID, secret: env.FEISHU_BOT_CONTENT_PRODUCER_APP_SECRET },
    { label: "work_editor", appId: env.FEISHU_BOT_WORK_EDITOR_APP_ID, secret: env.FEISHU_BOT_WORK_EDITOR_APP_SECRET },
    { label: "biz_diagnosis", appId: env.FEISHU_BOT_BIZ_DIAGNOSIS_APP_ID, secret: env.FEISHU_BOT_BIZ_DIAGNOSIS_APP_SECRET },
    { label: "topic_planner", appId: env.FEISHU_BOT_TOPIC_PLANNER_APP_ID, secret: env.FEISHU_BOT_TOPIC_PLANNER_APP_SECRET },
    { label: "content_review", appId: env.FEISHU_BOT_CONTENT_REVIEW_APP_ID, secret: env.FEISHU_BOT_CONTENT_REVIEW_APP_SECRET },
  ]
  const configured = apps.filter((app) => app.appId && app.secret)
  if (!configured.length) return { status: "unconfigured" as const, detail: "未配置任何飞书应用凭证" }

  const verdicts = await Promise.all(configured.map(async (app) => {
    try {
      const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: app.appId, app_secret: app.secret }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = (await response.json().catch(() => null)) as { code?: number; msg?: string } | null
      return { label: app.label, ok: response.ok && body?.code === 0, detail: `code=${body?.code ?? response.status}` }
    } catch (error) {
      return { label: app.label, ok: false, detail: error instanceof Error ? error.message.slice(0, 80) : "network" }
    }
  }))
  const broken = verdicts.filter((v) => !v.ok)
  const backgroundTasks = env.BACKGROUND_TASKS_ENABLED === "true"
  if (broken.length) {
    return {
      status: "failed" as const,
      detail: `bot 凭证失效：${broken.map((v) => `${v.label}(${v.detail})`).join("、")}`
        + `；BACKGROUND_TASKS_ENABLED=${backgroundTasks}`,
    }
  }
  return {
    status: "healthy" as const,
    detail: `${verdicts.length} 个应用凭证全部有效；BACKGROUND_TASKS_ENABLED=${backgroundTasks}`,
  }
}

// ── 效果回流：开放平台应用凭证 + 绑定 token 是否过期（过期=degraded，不阻断其它探针）──

async function probeOutcomeAutofetch() {
  if (!env.DOUYIN_CLIENT_KEY || !env.DOUYIN_CLIENT_SECRET) {
    return { status: "unconfigured" as const, detail: "DOUYIN_CLIENT_KEY/SECRET 未配置，无法回流抖音作品数据" }
  }
  try {
    const { prisma } = await import("@/lib/prisma")
    const expired = await prisma.douyinAccountBinding.count({
      where: {
        OR: [{ syncStatus: "expired" }, { accessExpiresAt: { lt: new Date() } }],
      },
    })
    if (expired > 0) {
      return {
        status: "degraded" as const,
        detail: `${expired} 个抖音绑定已过期，效果回流会跳过这些账号`,
      }
    }
    return { status: "healthy" as const }
  } catch {
    return { status: "degraded" as const, detail: "无法读取抖音绑定状态" }
  }
}

/**
 * 账号作品数据通道（WP-A1）：抖音官方作品列表能力已下线，改走 TikHub/红狐。
 * 探针只做配置体检（不查库，保持探针轻量可离线测试）：
 * 两条通道都未配置 → failed（账号历史与效果回流会全空）。
 * 单个账号是否缺 sec_user_id / 取数成败，由 account-works-sync cron 的
 * source/fallbackUsed/error 字段与自动化台账页呈现。
 */
async function probeAccountWorksChannel() {
  const tikhubReady = Boolean(env.TIKHUB_API_KEY)
  const redfoxReady = Boolean(env.REDFOX_API_KEY)
  if (!tikhubReady && !redfoxReady) {
    return {
      status: "failed" as const,
      detail: "TikHub 与红狐均未配置，账号作品数据通道不可用（账号历史与效果回流会全空）",
    }
  }
  return {
    status: "healthy" as const,
    detail: `作品数据通道就绪：TikHub ${tikhubReady ? "已配置（主）" : "未配置"} / 红狐 ${redfoxReady ? "已配置（备）" : "未配置"}`,
  }
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
  { name: "aliyun-sms", critical: false, run: probeAliyunSms },
  { name: "feishu-bots", critical: true, run: probeFeishuBots },
  { name: "outcome-autofetch", critical: false, run: probeOutcomeAutofetch },
  { name: "account-works-channel", critical: true, run: probeAccountWorksChannel },
]

export async function runIntegrationProbes(): Promise<IntegrationProbeResult[]> {
  return Promise.all(
    INTEGRATION_PROBES.map(async (probe) => {
      const result = await withLatency(probe.run)
      return { name: probe.name, critical: probe.critical, ...result }
    }),
  )
}
