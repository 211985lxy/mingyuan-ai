/**
 * Hypit provider 的「提交」与「取状态」两半。
 *
 * 拆出 `digital-human-provider.ts` 的原因有两个：
 * 1. 架构门禁要求单文件 ≤500 行，四家 provider 的提交逻辑挤在一个文件里已超限；
 * 2. Hypit 这一半的输入不是「形象 + 文案」而是**一份 SVML 源**，语义自成一体，
 *    和另外三家混在一起读起来互相干扰。
 *
 * 依赖方向是单向的：本文件 → `hypit.ts`（HTTP 面）/ `hypit-templates.ts`（模板）
 * / `digital-human-provider-error.ts`（错误类型）。不要反向 import
 * `digital-human-provider.ts`，否则成环。
 */

import {
  type HypitTaskResult,
  exportTargetOutputsToOss,
  getHypitBuild,
  isHypitBuildComplete,
  isHypitConfigured,
  isHypitEnabled,
  isHypitShadowMode,
  mapHypitBuildToTaskResult,
  submitHypitBuild,
  uploadHypitSource,
  waitForBuildId,
} from "@/lib/hypit"
import { buildHypitRunSource, renderHypitTemplateByName } from "@/lib/hypit-templates"
import { DigitalHumanProviderError } from "./digital-human-provider-error"

/**
 * Hypit 渲染服务出片提交。
 *
 * 与前三个 provider 的根本差异：Hypit 不认识「数字人形象 + 口播文案」这套输入，
 * 它渲染的是一份 **SVML 源**（模板）。所以这里按「有没有源」做 fail-closed 校验，
 * 而不是按 `videoType` 白名单。
 *
 * 载荷约定（`CreateVideoTaskInput` 的扩展字段，见 `video-task-request/contracts.ts`）：
 * - `hypitTemplateName`：预置模板名 + `hypitVariables` 变量（推荐，业务侧只需传文案）
 * - `hypitSourcePath`：渲染服务工作区内的一条 `.svml` / `.svs` / `.svrun` 路径
 * - `hypitSource`：内联源文本，服务端写入工作区后提交
 * - `hypitSourceFilename`：配合 `hypitSource` 指定扩展名（决定源类型），默认 `inline.svml`
 *
 * 返回的 `taskId` 是 **buildId**（不是提交阶段的 jobId）：轮询按 buildId 推进。
 * 渲染服务的 `POST /builds` 是异步的，可能只回 jobId；这里等到 buildId 出现为止，
 * 超时按提交失败处理，交给既有补偿链路回滚额度。
 */
export async function submitHypitVideo(
  payload: Record<string, unknown>,
): Promise<{ taskId: string; payload: Record<string, unknown> }> {
  if (!isHypitEnabled()) {
    throw new DigitalHumanProviderError("HYPIT_DISABLED", "本机渲染服务暂未开放，请联系管理员")
  }
  if (!isHypitConfigured()) {
    throw new DigitalHumanProviderError("HYPIT_NOT_CONFIGURED", "本机渲染服务暂未配置，请联系管理员")
  }

  const templateName = readString(payload.hypitTemplateName)
  const sourcePath = readString(payload.hypitSourcePath)
  const sourceContent = readString(payload.hypitSource)

  // 三种来源互斥：模板名 / 工作区路径 / 内联文本。同时给两种说明调用方自己也没想清楚，
  // 与其挑一个静默生效，不如直接失败。
  if (templateName && (sourcePath || sourceContent)) {
    throw new DigitalHumanProviderError(
      "AMBIGUOUS_HYPIT_SOURCE",
      "hypitTemplateName 与 hypitSource / hypitSourcePath 只能选一种",
    )
  }
  if (!templateName && !sourcePath && !sourceContent) {
    throw new DigitalHumanProviderError(
      "MISSING_VIDEO_INPUT",
      "缺少渲染源（hypitTemplateName 或 hypitSourcePath 或 hypitSource），无法提交渲染任务",
    )
  }

  const title = readString(payload.title)

  let submitted
  if (templateName) {
    // 模板提交固定两步（硬约束）：`build` 只吃 Run Source，而一次调用只写一个文件。
    // 1) 落盘并校验渲染后的 Author Source；2) 用返回的 .svrun 提交。
    const variables = readVariables(payload.hypitVariables)
    const { markup, targets, filename } = renderHypitTemplateByName(templateName, variables)
    const authorSource = await uploadHypitSource({ content: markup, filename })
    const runSource = buildHypitRunSource({ authorSource, targets })
    submitted = await submitHypitBuild({
      content: runSource.content,
      filename: runSource.filename,
      ...(title ? { title } : {}),
    })
  } else {
    const filename = readString(payload.hypitSourceFilename)
    submitted = await submitHypitBuild({
      ...(sourcePath ? { source: sourcePath } : { content: sourceContent! }),
      ...(filename ? { filename } : {}),
      ...(title ? { title } : {}),
    })
  }

  const buildId = submitted.buildId ?? await waitForBuildId(submitted.jobId)

  return {
    taskId: buildId,
    payload: {
      ...payload,
      hypitJobId: submitted.jobId,
      hypitBuildId: buildId,
      // 模板名进载荷：重试要用同一个模板重跑，而 `hypitVariables` 已在 payload 里
      ...(templateName ? { hypitTemplateName: templateName } : {}),
      // 影子期产物落隔离前缀，重试与排查都要靠这个快照还原当时的路由
      hypitShadow: isHypitShadowMode(),
    },
  }
}

/**
 * `hypitVariables` 只接受标量。
 *
 * 对象/数组一律丢弃——它们会被 `String()` 渲成 `[object Object]` 悄悄进片，
 * 属于「看得出错了但不知道哪错的」那类事故。
 */
function readVariables(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string | number> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" || typeof item === "number") out[key] = item
  }
  return out
}

/**
 * 把 Hypit 的 build 状态推进成 AIM 的任务结果。
 *
 * 渲染服务不提供「产物下载 URL」这类直接可分发的东西——产物躺在它自己的导出目录里，
 * 且那是带 TTL 的临时缓存。所以「渲染完成」到「有 videoUrl」之间还差一步：
 * 导出 + 转存 OSS。这一步放在状态查询里，因为返回契约要求 succeed 时带 `videoUrl`。
 *
 * 幂等性：OSS key 由 buildId + 产物名决定，重复导出是覆盖写；任务 settle 后不再轮询，
 * 正常只跑一次。
 *
 * 三比例：一次 build 会吐出多个 target 产物，全部导出进 `result.outputs`，
 * `videoUrl` 取 `preferredAspectRatio` 指定的那一条（不指定则取渲染顺序第一条）。
 *
 * 返回类型**必须**标注成 `HypitTaskResult`：不标注时 TS 会把 return 字面量收窄成
 * 「只有 status/result 的形状」，而这个函数的返回值会并进
 * `getVideoTaskStatusForProvider` 的联合类型——一旦少一个 `errorCode` 字段，
 * webhook 与轮询里访问 `result.errorCode` 就编译失败（HeyGen 分支同理）。
 */
export async function resolveHypitTaskResult(
  buildId: string,
  preferredAspectRatio?: "9:16" | "16:9" | "1:1",
): Promise<HypitTaskResult> {
  const build = await getHypitBuild(buildId)
  const mapped = mapHypitBuildToTaskResult(build)
  if (mapped.status === "failed") return mapped

  // 还没渲染完。
  if (!isHypitBuildComplete(build)) return { status: "processing" as const }

  const outputs = await exportTargetOutputsToOss(buildId, { preferredAspectRatio })
  const [primary] = outputs
  if (!primary) {
    return {
      status: "failed" as const,
      errorCode: "HYPIT_NO_OUTPUT",
      errorMessage: "渲染已完成但没有可交付的产物",
    }
  }
  return {
    status: "succeed" as const,
    progress: 100 as const,
    result: { videoUrl: primary.url, outputs },
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}
