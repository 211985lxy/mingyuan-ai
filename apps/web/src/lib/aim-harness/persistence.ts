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

import { prisma } from "@/lib/prisma"

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
