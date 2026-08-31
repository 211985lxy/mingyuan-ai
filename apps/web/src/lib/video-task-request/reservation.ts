import { Prisma } from "@/generated/prisma/client";
import { checkConcurrencyLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { buildReservedVideoTaskDefaults } from "@/lib/video-task-settlement";
import type { CreateVideoTaskInput, ResolvedAvatar, ResolvedPlan, ResolvedScript, VideoTaskType } from "./contracts";
import { TaskReservationError } from "./contracts";

export type VideoTaskReservation = {
  taskId: string;
  resolvedSourceTemplateId: string | null;
};

export async function reserveVideoTask(input: {
  userId: string;
  body: CreateVideoTaskInput;
  plan: ResolvedPlan | null;
  avatar: ResolvedAvatar | null;
  script: ResolvedScript | null;
  scriptContent: string;
  videoType: VideoTaskType;
  shanjianPayload: Record<string, unknown>;
}): Promise<VideoTaskReservation> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${input.userId} FOR UPDATE`;
    await enforceConcurrencyLimit(tx, input.userId);
    await reservePlanIfNeeded(tx, input.plan, input.userId);
    const script = await createTaskScriptIfNeeded(tx, input);
    const task = await tx.videoTask.create({
      data: {
        userId: input.userId,
        avatarId: input.avatar?.id === "public" ? null : input.avatar?.id ?? null,
        scriptId: script.id,
        productionPlanId: input.plan?.id ?? null,
        structureId: input.plan?.structureId ?? null,
        packagingTemplateId: input.plan?.packagingTemplateId ?? null,
        structureSnapshot: input.plan?.structureSnapshot as Prisma.InputJsonValue ?? undefined,
        packagingSnapshot: input.plan?.packagingSnapshot as Prisma.InputJsonValue ?? undefined,
        status: "queued",
        videoType: input.videoType,
        scriptContent: input.scriptContent,
        avatarName: input.avatar?.name ?? input.body.avatarName ?? "",
        shanjianPayload: input.shanjianPayload as Prisma.InputJsonValue,
        ...buildReservedVideoTaskDefaults(),
      },
    });
    return { taskId: task.id, resolvedSourceTemplateId: script.sourceTemplateId };
  });
}

async function enforceConcurrencyLimit(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
): Promise<void> {
  const dbUser = await tx.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const concurrency = await checkConcurrencyLimit(userId, dbUser?.plan ?? "free", { videoTask: tx.videoTask });
  if (!concurrency.allowed) {
    throw new TaskReservationError(
      `您当前有 ${concurrency.current} 个视频正在生成中，最多同时生成 ${concurrency.limit} 个。请等待当前任务完成后再试。`,
      429,
    );
  }
}

async function reservePlanIfNeeded(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  plan: ResolvedPlan | null,
  userId: string,
): Promise<void> {
  if (!plan) return;
  const reserved = await tx.videoProductionPlan.updateMany({
    where: { id: plan.id, userId, status: "draft" },
    data: { status: "confirmed" },
  });
  if (reserved.count === 0) throw new TaskReservationError("Production plan has already been used or reserved", 422);
}

async function createTaskScriptIfNeeded(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: Parameters<typeof reserveVideoTask>[0],
): Promise<{ id: string | null; sourceTemplateId: string | null }> {
  if (input.script) return { id: input.script.id, sourceTemplateId: input.script.sourceTemplateId };
  if (!input.scriptContent) return { id: null, sourceTemplateId: null };
  const script = await tx.script.create({
    data: { userId: input.userId, content: input.scriptContent, sourceTemplateId: input.body.sourceTemplateId ?? null },
  });
  return { id: script.id, sourceTemplateId: input.body.sourceTemplateId ?? null };
}
