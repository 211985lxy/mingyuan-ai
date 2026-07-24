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
import {
  buildCanonicalContentSpec,
  getCanonicalFromTaskSpec,
  isCanonicalConfirmed,
  withCanonicalOnTaskSpec,
} from "@/lib/canonical-content-spec"
import {
  buildContentPackageSpec,
  getContentPackageFromTaskSpec,
  withContentPackageOnTaskSpec,
} from "@/lib/content-package-spec"
import { mapEntriesToKnowledgeUsed } from "@/lib/aim-knowledge-cite"
import { prisma } from "@/lib/prisma"

/**
 * @description saveaimgenerationrecord
 * @param context - 上下文
 * @param completion - 补全
 * @param parsed - 解析后的数据
 * @returns 无返回值
 */
export async function saveAimGenerationRecord(
  context: AimGenerateContext,
  completion: { model?: string; usage?: { totalTokens?: number } },
  parsed: Record<ContentFormat, string | undefined>,
) {
  const clampVarchar = (value: string | null | undefined, max = 191) =>
    value ? value.slice(0, max) : null
  const sanitizeDbText = (value: string | null | undefined) =>
    value ? value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "") : null

  const knowledgeUsed = mapEntriesToKnowledgeUsed(context.retrievedEntries)

  // 阶段 2：生成时自动装配母内容草稿（已确认则保留，不覆盖）
  let taskSpecForPersist = context.taskSpec
  if (taskSpecForPersist) {
    const existingCanonical = getCanonicalFromTaskSpec(taskSpecForPersist)
    if (!existingCanonical || existingCanonical.status !== "confirmed") {
      const draft = buildCanonicalContentSpec({
        taskSpec: taskSpecForPersist,
        currentInput: context.rawInput,
        knowledgeUsed,
      })
      taskSpecForPersist = withCanonicalOnTaskSpec(taskSpecForPersist, draft)
    }
  }

  const startedAt = Date.now()
  const generationIdForPackage = context.existingGenerationId || ""

  if (context.skipPersistence) {
    let skipTaskSpec = taskSpecForPersist
    if (skipTaskSpec && isCanonicalConfirmed(getCanonicalFromTaskSpec(skipTaskSpec))) {
      const pkg = buildContentPackageSpec({
        canonicalGenerationId: generationIdForPackage || "draft",
        requestedFormats: context.targetFormats,
        parsed,
        knowledgeUsed,
        previous: getContentPackageFromTaskSpec(skipTaskSpec),
        model: completion.model,
        totalTokens: completion.usage?.totalTokens,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
      skipTaskSpec = withContentPackageOnTaskSpec(skipTaskSpec, pkg)
    }
    return {
      id: `eval_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      knowledgeUsed,
      taskSpec: skipTaskSpec,
    }
  }

  // 派生写入时合并宽表列，避免覆盖母稿已有格式
  let existingRow: {
    id: string
    videoScript: string | null
    wechatArticle: string | null
    momentsPost: string | null
    communityMessage: string | null
    shootingBrief: string | null
    rawCopy: string | null
    formatsRequested: unknown
    taskSpec: unknown
  } | null = null

  if (context.existingGenerationId) {
    existingRow = await prisma.aimGeneration.findFirst({
      where: { id: context.existingGenerationId, userId: context.userId },
      select: {
        id: true,
        videoScript: true,
        wechatArticle: true,
        momentsPost: true,
        communityMessage: true,
        shootingBrief: true,
        rawCopy: true,
        formatsRequested: true,
        taskSpec: true,
      },
    })
    if (existingRow?.taskSpec && typeof existingRow.taskSpec === "object" && !Array.isArray(existingRow.taskSpec)) {
      const existingCanonical = getCanonicalFromTaskSpec(existingRow.taskSpec)
      if (existingCanonical && isCanonicalConfirmed(existingCanonical)) {
        taskSpecForPersist = {
          ...(taskSpecForPersist ?? (existingRow.taskSpec as import("@/lib/task-spec").TaskSpec)),
          canonical: existingCanonical,
          contentPackage: getContentPackageFromTaskSpec(existingRow.taskSpec) ?? undefined,
        }
      }
    }
  }

  const pickColumn = (next: string | null | undefined, prev: string | null | undefined) => {
    const cleaned = sanitizeDbText(next)
    if (cleaned && cleaned.trim()) return cleaned
    return prev ?? null
  }

  const videoScript = pickColumn(parsed.video_script ?? parsed.koubo_script, existingRow?.videoScript)
  const wechatArticle = pickColumn(parsed.wechat_article, existingRow?.wechatArticle)
  const momentsPost = pickColumn(parsed.moments_post, existingRow?.momentsPost)
  const communityMessage = pickColumn(parsed.community_message, existingRow?.communityMessage)
  const shootingBrief = pickColumn(parsed.shooting_brief, existingRow?.shootingBrief)
  const rawCopy = pickColumn(parsed.raw_copy, existingRow?.rawCopy)

  const prevFormats = Array.isArray(existingRow?.formatsRequested)
    ? (existingRow!.formatsRequested as string[])
    : []
  const formatsRequested = [...new Set([...prevFormats, ...context.targetFormats])]

  if (taskSpecForPersist) {
    const canonical = getCanonicalFromTaskSpec(taskSpecForPersist)
    if (canonical && isCanonicalConfirmed(canonical)) {
      const pkg = buildContentPackageSpec({
        canonicalGenerationId: existingRow?.id || generationIdForPackage || "pending",
        requestedFormats: context.targetFormats,
        parsed,
        knowledgeUsed,
        previous: getContentPackageFromTaskSpec(taskSpecForPersist),
        model: completion.model,
        totalTokens: completion.usage?.totalTokens,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
      // 若尚无 generationId，创建后再回填；先用 pending
      taskSpecForPersist = withContentPackageOnTaskSpec(taskSpecForPersist, pkg)
    }
  }

  const data = {
    userId: context.userId,
    agentId: context.agentId,
    projectId: context.projectId || null,
    rawInput: sanitizeDbText(context.rawInput) ?? "",
    inputSource: "text",
    videoScript,
    wechatArticle,
    momentsPost,
    communityMessage,
    shootingBrief,
    rawCopy,
    formatsRequested,
    knowledgeUsed: knowledgeUsed as unknown as Prisma.InputJsonValue,
    topicTitle: clampVarchar(context.topicTitle),
    topicSelectionId: context.topicSelectionId,
    selectedTopicIndex: context.selectedTopicIndex,
    taskSpec: taskSpecForPersist ? (taskSpecForPersist as unknown as Prisma.InputJsonValue) : undefined,
    hotTopic: clampVarchar(context.hotTopic),
    polishInstruction: sanitizeDbText(context.polishInstruction),
    model: completion.model,
    totalTokens: completion.usage?.totalTokens || null,
    status: "completed",
  }

  const degradedData = {
    ...data,
    rawInput: "[omitted: original input could not be persisted safely]",
    videoScript: existingRow?.videoScript ?? null,
    wechatArticle: existingRow?.wechatArticle ?? null,
    momentsPost: existingRow?.momentsPost ?? null,
    communityMessage: existingRow?.communityMessage ?? null,
    shootingBrief: existingRow?.shootingBrief ?? null,
    rawCopy: existingRow?.rawCopy ?? null,
    polishInstruction: null,
  }

  const persist = async (payload: typeof data) => {
    if (context.existingGenerationId) {
      const existing = existingRow ?? await prisma.aimGeneration.findFirst({
        where: { id: context.existingGenerationId, userId: context.userId },
        select: { id: true },
      })
      if (existing) {
        // 更新时不要用空 rawInput 覆盖母稿输入
        const { rawInput: _ignored, userId: _u, ...updateData } = payload
        const updated = await prisma.aimGeneration.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            // 回填 canonicalGenerationId
            ...(payload.taskSpec && typeof payload.taskSpec === "object"
              ? {
                  taskSpec: (() => {
                    const ts = payload.taskSpec as Record<string, unknown>
                    const contentPackage = ts.contentPackage as Record<string, unknown> | undefined
                    if (contentPackage && contentPackage.canonicalGenerationId === "pending") {
                      return {
                        ...ts,
                        contentPackage: { ...contentPackage, canonicalGenerationId: existing.id },
                      } as Prisma.InputJsonValue
                    }
                    return payload.taskSpec
                  })(),
                }
              : {}),
          },
        })
        return updated
      }
      return prisma.aimGeneration.create({ data: payload })
    }
    const created = await prisma.aimGeneration.create({ data: payload })
    // 新建后若 contentPackage 仍是 pending，回填真实 id
    if (created.taskSpec && typeof created.taskSpec === "object" && !Array.isArray(created.taskSpec)) {
      const ts = created.taskSpec as Record<string, unknown>
      const contentPackage = ts.contentPackage as Record<string, unknown> | undefined
      if (contentPackage && contentPackage.canonicalGenerationId === "pending") {
        const nextTaskSpec = {
          ...ts,
          contentPackage: { ...contentPackage, canonicalGenerationId: created.id },
        }
        return prisma.aimGeneration.update({
          where: { id: created.id },
          data: { taskSpec: nextTaskSpec as Prisma.InputJsonValue },
        })
      }
    }
    return created
  }

  try {
    return await persist(data)
  } catch (error) {
    console.error("[aim/generate] history persist failed, retrying with degraded payload", error)
  }
  return persist(degradedData)
}

/**
 * @description 获取aimgenerationusage
 * @param id - 唯一标识符
 * @returns 无返回值
 */
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
/**
 * @description 标记aimgenerationdegraded
 * @param generationId - 生成结果唯一标识符
 * @param userId - 用户 ID
 * @returns Promise<void>
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
