import { ShanjianError } from "@/lib/shanjian";
import { resolveVideoTaskAvatar } from "./avatar";
import { type CreateVideoTaskInput, type ResolvedPlan, VideoTaskRequestError } from "./contracts";
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
): Promise<CreatedVideoTask> {
  const plan = await resolveProductionPlan(userId, body.productionPlanId);
  const videoType = resolveVideoTaskType(plan, body.type);
  const avatar = await resolveVideoTaskAvatar({ userId, videoType, body });
  const resolvedScript = await resolveVideoTaskScript({ userId, body, plan, videoType });
  const shanjianPayload = buildShanjianSubmitPayload({
    body,
    plan,
    videoType,
    avatar,
    scriptContent: resolvedScript.content,
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
    });
    const result = await submitReservedVideoTask({
      reservation,
      plan,
      videoType,
      shanjianSubmitPayload: shanjianPayload,
    });
    return toCreatedTask(result.task, result.queued ? 202 : 201, reservation);
  } catch (error) {
    return recoverOrThrow(error, reservation, plan);
  }
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
  if (error instanceof ShanjianError) {
    return new VideoTaskRequestError(error.message, 502, { code: error.code, requestId: error.requestId ?? null });
  }
  return new VideoTaskRequestError(
    error instanceof Error ? error.message : "Failed to create video task",
    500,
  );
}
