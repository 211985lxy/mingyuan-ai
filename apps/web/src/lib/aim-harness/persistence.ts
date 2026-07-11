/**
 * AIM Harness v2 — 持久化收口（阶段 2.4 起）。
 *
 * 把"生成记录 / 快照 / trace"的写入与回标集中到这里，供 executeAimRun / streamAimRun
 * 统一调用，消除此前散落在 handler 与 adapter 各自的写入点。
 *
 * 阶段 2.4 先落地最关键的一处：degraded 语义裂缝修复——provider fallback 降级时，
 * AimGeneration.status 此前永远 "completed"，与 snapshot/trace 的 degraded:true 不一致；
 * 现在由 executeAimRun 在降级运行后回标 status="degraded"，使三处语义对齐。
 *
 * 其余持久化（saveAimGenerationRecord / persistAimRunSnapshot / applyRunMetadataToTrace）
 * 仍由 handler.generate 与 adapter 承担，阶段 3 handler 拆分时再整体迁入本文件。
 */

import { randomUUID } from "node:crypto"

import type { Prisma } from "@/generated/prisma/client"
import type { AimGenerateContext } from "@/lib/aim-agent-handlers"
import type { ContentFormat } from "@/lib/aim-generator"
import { prisma } from "@/lib/prisma"

export async function saveAimGenerationRecord(
  context: AimGenerateContext,
  completion: { model?: string; usage?: { totalTokens?: number } },
  parsed: Record<ContentFormat, string | undefined>,
) {
  const clampVarchar = (value: string | null | undefined, max = 191) =>
    value ? value.slice(0, max) : null
  const sanitizeDbText = (value: string | null | undefined) =>
    value ? value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "") : null

  const knowledgeUsed = context.retrievedEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
  }))

  if (context.skipPersistence) {
    return {
      id: `eval_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      knowledgeUsed,
    }
  }

  const data = {
    userId: context.userId,
    agentId: context.agentId,
    projectId: context.projectId || null,
    rawInput: sanitizeDbText(context.rawInput) ?? "",
    inputSource: "text",
    videoScript: sanitizeDbText(parsed.video_script),
    wechatArticle: sanitizeDbText(parsed.wechat_article),
    momentsPost: sanitizeDbText(parsed.moments_post),
    communityMessage: sanitizeDbText(parsed.community_message),
    shootingBrief: sanitizeDbText(parsed.shooting_brief),
    rawCopy: sanitizeDbText(parsed.raw_copy),
    formatsRequested: context.targetFormats,
    knowledgeUsed,
    topicTitle: clampVarchar(context.topicTitle),
    topicSelectionId: context.topicSelectionId,
    selectedTopicIndex: context.selectedTopicIndex,
    taskSpec: context.taskSpec ? (context.taskSpec as unknown as Prisma.InputJsonValue) : undefined,
    hotTopic: clampVarchar(context.hotTopic),
    polishInstruction: sanitizeDbText(context.polishInstruction),
    model: completion.model,
    totalTokens: completion.usage?.totalTokens || null,
    status: "completed",
  }

  const degradedData = {
    ...data,
    rawInput: "[omitted: original input could not be persisted safely]",
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    polishInstruction: null,
  }

  const persist = (payload: typeof data) => {
    if (context.existingGenerationId) {
      return prisma.aimGeneration.findFirst({
        where: { id: context.existingGenerationId, userId: context.userId },
        select: { id: true },
      }).then((existing) => existing
        ? prisma.aimGeneration.update({ where: { id: existing.id }, data: payload })
        : prisma.aimGeneration.create({ data: payload }))
    }
    return prisma.aimGeneration.create({ data: payload })
  }

  try {
    return await persist(data)
  } catch (error) {
    console.error("[aim/generate] history persist failed, retrying with degraded payload", error)
  }
  return persist(degradedData)
}

export async function getAimGenerationUsage(id: string) {
  return prisma.aimGeneration.findUnique({
    where: { id },
    select: { model: true, totalTokens: true },
  }).catch(() => null)
}

/**
 * 把一条已落库的 AimGeneration 标记为 degraded（provider fallback 降级）。
 *
 * 仅按 (id, userId) 更新 status，避免跨用户越权回标；DB 不可用时静默失败（best-effort），
 * 不阻断已完成的生成——snapshot/trace 已记录 degraded，可作诊断依据。
 *
 * @param generationId AimGeneration.id（saveAimGenerationRecord 落库返回）
 * @param userId 执行者 id（隔离校验）
 */
export async function flagAimGenerationDegraded(
  generationId: string,
  userId: string,
): Promise<void> {
  await prisma.aimGeneration.updateMany({
    where: { id: generationId, userId },
    data: { status: "degraded" },
  })
}
