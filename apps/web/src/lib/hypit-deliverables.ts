/**
 * Hypit 产物导出与转存。
 *
 * 单独成文件的原因同 `hypit-client.ts`：架构门禁要求单文件 ≤500 行，而导出这一段
 * 自带一套「媒体类型 → 扩展名 / OSS key 清洗 / 二进制下载」的工具函数，
 * 放进 `hypit.ts` 会把它推过上限。
 *
 * 调用方仍从 `@/lib/hypit` 导入这些函数——`hypit.ts` 做了转出，import 路径不变。
 */

import { uploadBufferToOss } from "@/lib/oss"
import {
  API_TOKEN,
  DOWNLOAD_TIMEOUT_MS,
  HypitError,
  RENDERER_URL,
  TOKEN_HEADER,
  assertConfigured,
  call,
  isHypitShadowMode,
  log,
  safeJson,
} from "./hypit-client"
import {
  type HypitAspectRatio,
  type HypitDeliverable,
  inferHypitAspectRatio,
  sortDeliverables,
} from "./hypit-ratio"
import type { HypitOutput } from "./hypit"
import { externalApiDuration, externalApiRequestsTotal } from "./metrics"

/**
 * 产物在 OSS 上的顶层前缀：影子期隔离，避免污染正式分发路径。
 *
 * 走 `isHypitShadowMode()` 而不是直接读 `process.env`——开关的语义（写入但不对外
 * 分发）集中在 `hypit-client.ts` 一处，任何人改判定条件时不会漏掉导出路径。
 */
function ossPrefix(): string {
  return isHypitShadowMode() ? "hypit-shadow" : "hypit"
}

/**
 * 取产物清单（`inspect`）。
 *
 * 刻意不复用 `hypit.ts` 的 `inspectHypitBuild`——那个函数返回整个 build，而这里
 * 只要 outputs；这样本模块就不必反向依赖 `hypit.ts`（它转出了本模块的函数，
 * 静态互相 import 会成环）。
 */
async function listOutputs(buildId: string): Promise<HypitOutput[]> {
  const body = await call<{ build?: { id?: string; outputs?: HypitOutput[] } }>(
    `/api/v1/builds/${encodeURIComponent(buildId)}/inspect`,
  )
  if (!body.build?.id) {
    throw new HypitError("HYPIT_BAD_RESPONSE", "渲染服务返回了无法解析的 build 详情")
  }
  return body.build.outputs ?? []
}

/**
 * 导出 build 的**全部**目标产物并转存到 OSS。
 *
 * 三比例是同一个 build 的多个 target（模板里三个 Canvas + 三个 render:Video），
 * 所以一次渲染要交付多条 URL，而不是只挑第一条。
 *
 * 为什么要经过 OSS：渲染服务的导出目录是带 TTL 的临时缓存（默认 24h），
 * 且只在服务器本机可达；`VideoTask` 需要一个长期有效的 URL。
 *
 * 幂等性：OSS key 由 buildId + 产物名决定，重复调用是覆盖写。轮询在任务 settle
 * 后即停止，正常路径只导出一次。
 *
 * @param preferredAspectRatio 指定时把该比例的产物排到第一位（决定 `videoUrl` 取哪条）。
 */
export async function exportTargetOutputsToOss(
  buildId: string,
  options: { preferredAspectRatio?: HypitAspectRatio } = {},
): Promise<HypitDeliverable[]> {
  const outputs = await listOutputs(buildId)
  const targets = outputs.filter((item) => item.target === true)
  const chosen = targets.length > 0 ? targets : outputs

  if (chosen.length === 0) {
    throw new HypitError("HYPIT_NO_OUTPUT", "渲染结果里没有可交付的产物")
  }

  const deliverables: HypitDeliverable[] = []
  for (const item of chosen) {
    const { buffer, mediaType } = await downloadOutput(item.name, buildId)
    const key = `${ossPrefix()}/${buildId}/${sanitizeSegment(item.name)}${extensionFor(mediaType)}`
    const url = await uploadBufferToOss(key, buffer, mediaType)
    deliverables.push({
      outputName: item.name,
      url,
      mediaType,
      aspectRatio: inferHypitAspectRatio(item.name),
    })
    log.info(
      { buildId, output: item.name, bytes: buffer.byteLength, shadow: isHypitShadowMode() },
      "Hypit output exported to OSS",
    )
  }

  return sortDeliverables(deliverables, options.preferredAspectRatio)
}

/**
 * 按名字导出**指定**的那一条产物。
 *
 * 三比例链路用 {@link exportTargetOutputsToOss}；这里只服务「明知要哪一条」的场景
 * （例如运营后台重试某一条失败产物）。
 */
export async function exportNamedOutputToOss(
  buildId: string,
  outputName: string,
): Promise<HypitDeliverable> {
  const outputs = await listOutputs(buildId)
  const chosen = outputs.find((item) => item.name === outputName)
  if (!chosen) {
    throw new HypitError("HYPIT_NO_OUTPUT", `渲染结果里没有名为 ${outputName} 的产物`)
  }
  const { buffer, mediaType } = await downloadOutput(chosen.name, buildId)
  const key = `${ossPrefix()}/${buildId}/${sanitizeSegment(chosen.name)}${extensionFor(mediaType)}`
  const url = await uploadBufferToOss(key, buffer, mediaType)
  log.info(
    { buildId, output: chosen.name, bytes: buffer.byteLength, shadow: isHypitShadowMode() },
    "Hypit output exported to OSS",
  )
  return {
    outputName: chosen.name,
    url,
    mediaType,
    aspectRatio: inferHypitAspectRatio(chosen.name),
  }
}

/**
 * 直接取回导出字节（不上传）。
 *
 * 走 `/outputs/{name}/download`：渲染服务内部用 `hypit get` 导出到自己的临时目录再回传。
 * 逻辑产物名（`final.video`）不带扩展名，媒体类型以响应头 `x-hypit-media-type` 为准。
 */
export async function downloadOutput(
  name: string,
  buildId?: string,
): Promise<{ buffer: Buffer; mediaType: string }> {
  assertConfigured()

  const url = new URL(`${RENDERER_URL}/api/v1/outputs/${encodeURIComponent(name)}/download`)
  if (buildId) url.searchParams.set("build", buildId)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  const started = Date.now()

  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: { [TOKEN_HEADER]: API_TOKEN },
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    externalApiRequestsTotal.inc({
      service: "hypit",
      endpoint: "/outputs/download",
      status: "network_error",
    })
    if (error instanceof Error && error.name === "AbortError") {
      throw new HypitError("HYPIT_EXPORT_TIMEOUT", "导出成片超时，请稍后重试")
    }
    throw new HypitError("HYPIT_UNREACHABLE", "本机渲染服务当前不可达，请联系管理员")
  }
  clearTimeout(timeout)

  externalApiDuration.observe(
    { service: "hypit", endpoint: "/outputs/download" },
    (Date.now() - started) / 1000,
  )

  if (!res.ok) {
    const detail = await safeJson<{ code?: string; message?: string }>(res)
    externalApiRequestsTotal.inc({
      service: "hypit",
      endpoint: "/outputs/download",
      status: detail?.code ?? `HTTP_${res.status}`,
    })
    throw new HypitError(
      detail?.code ?? `HTTP_${res.status}`,
      detail?.message ?? "导出成片失败，产物可能尚未生成",
    )
  }

  externalApiRequestsTotal.inc({ service: "hypit", endpoint: "/outputs/download", status: "ok" })
  const buffer = Buffer.from(await res.arrayBuffer())
  const mediaType =
    res.headers.get("x-hypit-media-type")
    ?? res.headers.get("content-type")
    ?? "application/octet-stream"

  return { buffer, mediaType }
}

function extensionFor(mediaType: string): string {
  const base = mediaType.split(";")[0].trim().toLowerCase()
  return {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "application/zip": ".zip",
  }[base] ?? ""
}

/** OSS key 段只保留安全字符：产物名可能含点号与中文。 */
function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "output"
}
