/**
 * 灵感生成服务（WP-12 Commit D）。
 *
 * 从 api/inspiration/[id]/generate/route.ts 原样迁出：灵感归属查找与校验、
 * 生成请求构造、生成结果回写。路由瘦身到只保留：认证 → 取 params → 解析 body
 * → 调本模块准备 → Harness 执行 → 响应 → catch。
 *
 * 不可变契约（与原 route 字节一致）：
 *  - inspiration.findFirst({ where: { id, userId } }) 的归属隔离不变；
 *  - 404 文案「灵感记录不存在」不变；400 文案「请选择 IP 营销全案」不变；
 *  - targetFormats 固定三元组 [video_script, shooting_brief, moments_post] 不变；
 *  - entrypoint 固定 "inspiration"、agentId 固定 "content_producer"、taskType "write_script"；
 *  - Harness 入口由 route 直接调用 executeAimRun（满足架构护栏 R1）。
 */
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { AimTraceRecorder } from "@/lib/aim-observability"

export const INSPIRATION_TARGET_FORMATS = [
  "video_script",
  "shooting_brief",
  "moments_post",
] as const

/**
 * 按归属查找灵感记录（findFirst 必须按 id + userId 过滤，确保用户隔离）。
 * 返回 null 表示不存在或不属于该用户 → route 回 404。
 */
export async function findOwnedInspiration(input: {
  id: string
  userId: string
}) {
  return prisma.inspiration.findFirst({ where: { id: input.id, userId: input.userId } })
}

/**
 * 构造 inspiration generate 的 executeAimRun 请求对象（不调用 Harness —— 由 route
 * 调用以满足架构护栏 R1）。固定 entrypoint=inspiration / agentId=content_producer /
 * taskType=write_script / 三元组格式。
 */
export function prepareInspirationGeneration(input: {
  inspirationContent: string
  topicTitle?: string
  userId: string
  projectId: string
  trace?: AimTraceRecorder
}) {
  const { inspirationContent, topicTitle, userId, projectId, trace } = input
  return {
    entrypoint: "inspiration" as const,
    rawInput: inspirationContent,
    agentId: "content_producer",
    targetFormats: [...INSPIRATION_TARGET_FORMATS],
    taskType: "write_script" as const,
    topicTitle,
    actorId: userId,
    projectId,
    trace,
    runLlmQuality: false,
  }
}

/**
 * 把生成结果回写到灵感记录（generatedContent + aimGenerationId）。
 * 逐字迁出原 route 的 inspiration.update。
 */
export async function persistInspirationGeneration<T extends { id: string }>(input: {
  id: string
  result: T
}) {
  await prisma.inspiration.update({
    where: { id: input.id },
    data: {
      generatedContent: input.result as unknown as Prisma.InputJsonValue,
      aimGenerationId: input.result.id,
    },
  })
}

/** inspiration generate 响应转换（含 additive harness 诊断字段）。 */
export function buildInspirationGenerateResponse<T extends { id: string }>(input: {
  result: T
  run: {
    metadata: { runId: string; degraded: boolean; provider: string; model: string }
  }
}) {
  const { result, run } = input
  return {
    ...result,
    runId: run.metadata.runId,
    degraded: run.metadata.degraded,
    provider: run.metadata.provider,
    model: run.metadata.model,
  }
}
