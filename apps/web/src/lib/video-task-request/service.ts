import { Prisma } from "@/generated/prisma/client";
import {
  DigitalHumanProviderError,
  getDigitalHumanProvider,
  type DigitalHumanProvider,
} from "@/lib/digital-human-provider";
import { prisma } from "@/lib/prisma";
import { buildVideoTaskIdempotencyKey } from "@/lib/video-task-domain";
import {
  AVATAR_REQUIRING_TYPES,
  type CreateVideoTaskInput,
  type ResolvedPlan,
  VideoTaskRequestError,
} from "./contracts";
import { resolveVideoTaskAvatar } from "./avatar";
import { buildShanjianSubmitPayload, resolveVideoTaskType } from "./payload";
import { resolveProductionPlan } from "./plan";
import { reserveVideoTask, type VideoTaskReservation } from "./reservation";
import { resolveVideoTaskScript } from "./script";
import {
  AcceptedSubmissionFinalizeError,
  compensateUnacceptedReservation,
  reconcileAcceptedSubmission,
  submitReservedVideoTask,
  UpstreamSubmissionError,
} from "./submission";

export type CreatedVideoTask = {
  status: 201 | 202;
  data: Record<string, unknown>;
};

export async function createVideoTask(
  userId: string,
  body: CreateVideoTaskInput,
  options: { provider?: DigitalHumanProvider; retryOfTaskId?: string } = {},
): Promise<CreatedVideoTask> {
  const plan = await resolveProductionPlan(userId, body.productionPlanId);
  const videoType = resolveVideoTaskType(plan, body.type);
  const projectId = await resolveTaskProject(userId, body.projectId, videoType);
  const aimGenerationId = await resolveAimGeneration(userId, projectId, body.aimGenerationId);
  const provider = options.provider ?? getDigitalHumanProvider();
  const retryOfTaskId = await resolveRetrySource(userId, options.retryOfTaskId ?? body.retryOfTaskId, projectId, provider);
  const aspectRatio = resolveAspectRatio(body.aspectRatio);
  const avatar = await resolveVideoTaskAvatar({ userId, projectId, videoType, body });
  const resolvedScript = await resolveVideoTaskScript({ userId, body, plan, videoType });
  const idempotencyKey = buildVideoTaskIdempotencyKey({
    userId,
    projectId,
    aimGenerationId,
    avatarId: avatar?.id === "public" ? null : avatar?.id ?? null,
    scriptContent: resolvedScript.content,
    aspectRatio,
    provider,
    actionId: body.actionId,
  });
  const shanjianPayload = buildShanjianSubmitPayload({
    body,
    plan,
    videoType,
    avatar,
    scriptContent: resolvedScript.content,
    aspectRatio,
  });

  let reservation: VideoTaskReservation | null = null;
  try {
    reservation = await reserveVideoTask({
      userId,
      body,
      plan,
      avatar,
      script: resolvedScript.script,
      scriptContent: resolvedScript.content,
      videoType,
      shanjianPayload,
      projectId,
      aimGenerationId,
      provider,
      idempotencyKey,
      retryOfTaskId,
    });
    if (reservation.existingTask) {
      return toCreatedTask(
        reservation.existingTask,
        reservation.existingTask.status === "completed" ? 201 : 202,
        reservation,
      );
    }
    const result = await submitReservedVideoTask({
      reservation,
      plan,
      videoType,
      shanjianSubmitPayload: shanjianPayload,
      provider,
    });
    return toCreatedTask(result.task, result.queued ? 202 : 201, reservation);
  } catch (error) {
    if (isUniqueViolation(error) && idempotencyKey) {
      const existing = await prisma.videoTask.findUnique({ where: { idempotencyKey } });
      if (existing) return toCreatedTask(existing as unknown as Record<string, unknown>, existing.status === "completed" ? 201 : 202, {
        taskId: existing.id,
        resolvedSourceTemplateId: existing.scriptId,
      });
    }
    return recoverOrThrow(error, reservation, plan);
  }
}

async function resolveRetrySource(
  userId: string,
  requestedRetryId: string | undefined,
  projectId: string | null,
  provider: DigitalHumanProvider,
): Promise<string | null> {
  const retryOfTaskId = requestedRetryId?.trim() || null;
  if (!retryOfTaskId) return null;
  const original = await prisma.videoTask.findFirst({
    where: { id: retryOfTaskId, userId },
    select: { id: true, status: true, projectId: true, provider: true },
  });
  if (!original) throw new VideoTaskRequestError("Original video task not found", 404, { field: "retryOfTaskId" });
  if (original.status !== "failed") throw new VideoTaskRequestError("Only failed video tasks can be retried", 422, { field: "retryOfTaskId" });
  if (original.projectId !== projectId) throw new VideoTaskRequestError("Retry task must stay within the original project", 422, { field: "projectId" });
  if (provider !== original.provider && provider !== "shanjian") {
    throw new VideoTaskRequestError("Cross-provider retry requires an administrator action", 403, { code: "ADMIN_PROVIDER_SWITCH_REQUIRED" });
  }
  return original.id;
}

async function resolveTaskProject(
  userId: string,
  requestedProjectId: string | undefined,
  videoType: string,
): Promise<string | null> {
  const projectId = requestedProjectId?.trim() || null;
  if (!projectId) {
    if (AVATAR_REQUIRING_TYPES.includes(videoType as (typeof AVATAR_REQUIRING_TYPES)[number])) {
      throw new VideoTaskRequestError("projectId is required for digital-human video tasks", 400, { field: "projectId" });
    }
    return null;
  }
  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  });
  if (!project) throw new VideoTaskRequestError("Project not found", 404, { field: "projectId" });
  return project.id;
}

async function resolveAimGeneration(
  userId: string,
  projectId: string | null,
  requestedGenerationId: string | undefined,
): Promise<string | null> {
  const generationId = requestedGenerationId?.trim() || null;
  if (!generationId) return null;
  if (!projectId) throw new VideoTaskRequestError("projectId is required with aimGenerationId", 400, { field: "projectId" });
  const generation = await prisma.aimGeneration.findFirst({
    where: { id: generationId, userId, projectId },
    select: { id: true },
  });
  if (!generation) throw new VideoTaskRequestError("AIM generation not found", 404, { field: "aimGenerationId" });
  return generation.id;
}

function resolveAspectRatio(value: CreateVideoTaskInput["aspectRatio"]): "9:16" | "16:9" {
  if (!value) return "9:16";
  if (value === "9:16" || value === "16:9") return value;
  throw new VideoTaskRequestError("aspectRatio must be 9:16 or 16:9", 400, { field: "aspectRatio" });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toCreatedTask(
  task: Record<string, unknown>,
  status: 201 | 202,
  reservation: VideoTaskReservation,
): CreatedVideoTask {
  return { status, data: { ...task, sourceTemplateId: reservation.resolvedSourceTemplateId } };
}

async function recoverOrThrow(
  error: unknown,
  reservation: VideoTaskReservation | null,
  plan: ResolvedPlan | null,
): Promise<CreatedVideoTask> {
  if (error instanceof VideoTaskRequestError) throw error;

  if (error instanceof AcceptedSubmissionFinalizeError && reservation) {
    try {
      const recovered = await reconcileAcceptedSubmission({ reservation, plan, accepted: error.accepted });
      if (recovered) return toCreatedTask(recovered, 201, reservation);
    } catch (recoveryError) {
      console.error("[tasks] Failed to reconcile accepted upstream task", recoveryError);
    }
  }

  if (reservation && !(error instanceof AcceptedSubmissionFinalizeError) && !(error instanceof UpstreamSubmissionError)) {
    await compensateUnacceptedReservation(reservation.taskId, error);
  }
  const originalError = error instanceof UpstreamSubmissionError
    ? error.submissionError
    : error instanceof AcceptedSubmissionFinalizeError
      ? error.cause
      : error;
  throw toRequestError(originalError);
}

function toRequestError(error: unknown): VideoTaskRequestError {
  if (error instanceof DigitalHumanProviderError) {
    return new VideoTaskRequestError(error.message, 502, { code: error.code, requestId: error.requestId ?? null });
  }
  return new VideoTaskRequestError(
    error instanceof Error ? error.message : "Failed to create video task",
    500,
  );
}
