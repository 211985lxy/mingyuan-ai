import { getTaskInfo } from "@/lib/shanjian";
import { settleVideoTaskFailure, settleVideoTaskSuccess } from "@/lib/video-task-settlement";
import { acquireTaskRecoveryLock } from "./lock";
import type { TaskRecoveryCandidates } from "./queries";

type VideoTask = TaskRecoveryCandidates[1][number];
type OrphanedVideoTask = TaskRecoveryCandidates[2][number];

export async function pollStaleVideos(tasks: VideoTask[], logPrefix: string): Promise<number> {
  let polled = 0;
  for (const task of tasks) {
    if (task.externalTaskId && await pollVideoTask(task, logPrefix)) polled++;
  }
  return polled;
}

async function pollVideoTask(task: VideoTask, logPrefix: string): Promise<boolean> {
  const externalTaskId = task.externalTaskId;
  if (!externalTaskId || !await acquireTaskRecoveryLock(`poll:${externalTaskId}`)) return false;

  try {
    const result = await getTaskInfo(externalTaskId);
    if (result.status === "succeed") await settleSuccessfulVideo(task.id, result, logPrefix);
    if (result.status === "failed") await settleVideoTaskFailure({ taskId: task.id, errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null, source: "recovery" });
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to poll video task ${task.id}:`, error);
    return false;
  }
}

async function settleSuccessfulVideo(
  taskId: string,
  result: Awaited<ReturnType<typeof getTaskInfo>>,
  logPrefix: string,
): Promise<void> {
  if (!result.result?.videoUrl) {
    console.warn(`${logPrefix} Video task ${taskId} succeed but no videoUrl; skipping`);
    return;
  }
  await settleVideoTaskSuccess({
    taskId,
    result: { videoUrl: result.result.videoUrl, coverUrl: result.result.coverUrl, duration: result.result.duration },
    source: "recovery",
  });
}

export async function expireOrphanedPendingTasks(
  tasks: OrphanedVideoTask[],
  logPrefix: string,
): Promise<number> {
  let expired = 0;
  for (const task of tasks) {
    if (await expireOrphanedPendingTask(task.id, logPrefix)) expired++;
  }
  return expired;
}

async function expireOrphanedPendingTask(taskId: string, logPrefix: string): Promise<boolean> {
  if (!await acquireTaskRecoveryLock(`expire-pending:${taskId}`)) return false;
  try {
    await settleVideoTaskFailure({
      taskId,
      errorCode: "TASK_SUBMISSION_FAILED",
      errorMessage: "任务已预留，但提交到视频服务时失败，请重试。",
      source: "recovery",
      releasePlanReservation: true,
    });
    console.warn(`${logPrefix} Expired orphaned pending video task ${taskId} (no externalTaskId after timeout)`);
    return true;
  } catch (error) {
    console.error(`${logPrefix} Failed to expire orphaned pending task ${taskId}:`, error);
    return false;
  }
}
