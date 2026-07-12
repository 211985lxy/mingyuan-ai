import { prisma } from "@/lib/prisma";
import { ShanjianError } from "@/lib/shanjian";
import { acquireSlot } from "@/lib/shanjian-semaphore";
import { submitToShanjian } from "@/lib/shanjian-submit";
import { compensateVideoTaskSubmissionFailure, finalizeAcceptedVideoTaskSubmission } from "@/lib/video-task-settlement";
import type { ResolvedPlan, VideoTaskType } from "./contracts";
import type { VideoTaskReservation } from "./reservation";

type StoredTask = NonNullable<Awaited<ReturnType<typeof prisma.videoTask.findUnique>>>;

export type AcceptedSubmission = {
  externalTaskId: string;
  shanjianPayload: Record<string, unknown>;
};

export type SubmissionResult =
  | { queued: true; task: StoredTask }
  | { queued: false; task: StoredTask };

export class AcceptedSubmissionFinalizeError extends Error {
  constructor(readonly accepted: AcceptedSubmission, cause: unknown) {
    super("Accepted video task could not be finalized", { cause });
    this.name = "AcceptedSubmissionFinalizeError";
  }
}

export class UpstreamSubmissionError extends Error {
  constructor(readonly submissionError: unknown) {
    super("Upstream video task submission failed", { cause: submissionError });
    this.name = "UpstreamSubmissionError";
  }
}

export async function submitReservedVideoTask(input: {
  reservation: VideoTaskReservation;
  plan: ResolvedPlan | null;
  videoType: VideoTaskType;
  shanjianSubmitPayload: Record<string, unknown>;
}): Promise<SubmissionResult> {
  if (!await acquireSlot()) return { queued: true, task: await loadReservedTask(input.reservation.taskId) };
  await prisma.videoTask.update({ where: { id: input.reservation.taskId }, data: { status: "pending" } });

  const accepted = await submitToUpstream(input);
  try {
    const task = await finalizeAcceptedVideoTaskSubmission({
      taskId: input.reservation.taskId,
      externalTaskId: accepted.externalTaskId,
      productionPlanId: input.plan?.id ?? null,
      shanjianPayload: accepted.shanjianPayload,
    });
    if (!task) throw new Error("Submitted task could not be reloaded");
    return { queued: false, task };
  } catch (error) {
    throw new AcceptedSubmissionFinalizeError(accepted, error);
  }
}

async function loadReservedTask(taskId: string): Promise<StoredTask> {
  const task = await prisma.videoTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Reserved task could not be reloaded");
  return task;
}

async function submitToUpstream(input: {
  reservation: VideoTaskReservation;
  videoType: VideoTaskType;
  shanjianSubmitPayload: Record<string, unknown>;
}): Promise<AcceptedSubmission> {
  try {
    const result = await submitToShanjian(input.videoType, input.shanjianSubmitPayload);
    return { externalTaskId: result.taskId, shanjianPayload: result.payload };
  } catch (error) {
    await compensateVideoTaskSubmissionFailure({
      taskId: input.reservation.taskId,
      errorCode: error instanceof ShanjianError ? error.code : undefined,
      errorMessage: error instanceof Error ? error.message : "Failed to create video task",
    });
    throw new UpstreamSubmissionError(error);
  }
}

export async function reconcileAcceptedSubmission(input: {
  reservation: VideoTaskReservation;
  plan: ResolvedPlan | null;
  accepted: AcceptedSubmission;
}): Promise<StoredTask | null> {
  return finalizeAcceptedVideoTaskSubmission({
    taskId: input.reservation.taskId,
    externalTaskId: input.accepted.externalTaskId,
    productionPlanId: input.plan?.id ?? null,
    shanjianPayload: input.accepted.shanjianPayload,
  });
}

export async function compensateUnacceptedReservation(
  taskId: string,
  error: unknown,
): Promise<void> {
  await compensateVideoTaskSubmissionFailure({
    taskId,
    errorCode: error instanceof ShanjianError ? error.code : undefined,
    errorMessage: error instanceof Error ? error.message : "Failed to create video task",
  });
}
