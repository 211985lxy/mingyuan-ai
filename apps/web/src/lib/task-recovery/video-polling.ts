import { getVideoTaskStatusForProvider, isDigitalHumanProvider } from "@/lib/digital-human-provider";
import { digitalHumanEventsTotal } from "@/lib/metrics";
import type { DigitalHumanProvider } from "@/lib/digital-human-semaphore";
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
  toRenderOutputsJson,
} from "@/lib/video-task-settlement";
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

  const provider = normalizeProvider(task.provider);
  if (!provider) {
    console.warn(`${logPrefix} Video task ${task.id} has unknown provider "${task.provider}"; skipping poll`);
    return false;
  }

  try {
    digitalHumanEventsTotal.inc({ provider, event: "poll", status: "started" });
    const result = await getVideoTaskStatusForProvider(
      provider,
      externalTaskId,
      // Hypit 一次渲染出三比例，要给状态查询一个「首选哪条」的依据；其余 provider 忽略
      { aspectRatio: readPayloadAspectRatio(task) },
    );
    digitalHumanEventsTotal.inc({ provider, event: "poll", status: result.status });
    if (result.status === "succeed") await settleSuccessfulVideo(task.id, result, logPrefix);
    if (result.status === "failed") await settleVideoTaskFailure({ taskId: task.id, errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null, source: "recovery" });
    return true;
  } catch (error) {
    digitalHumanEventsTotal.inc({ provider, event: "provider_error", status: "poll" });
    console.error(`${logPrefix} Failed to poll video task ${task.id}:`, error);
    return false;
  }
}

async function settleSuccessfulVideo(
  taskId: string,
  result: Awaited<ReturnType<typeof getVideoTaskStatusForProvider>>,
  logPrefix: string,
): Promise<void> {
  if (!result.result?.videoUrl) {
    console.warn(`${logPrefix} Video task ${taskId} succeed but no videoUrl; skipping`);
    return;
  }
  await settleVideoTaskSuccess({
    taskId,
    result: {
      videoUrl: result.result.videoUrl,
      coverUrl: result.result.coverUrl,
      duration: result.result.duration,
      // 三比例：除主 URL 外的其余产物一并落库，否则用户只能拿到一条
      renderOutputs: toRenderOutputsJson(readProviderOutputs(result)),
    },
    source: "recovery",
  });
}

/**
 * 读 provider 结果里的多产物清单。
 *
 * 必须走类型守卫而不是直接 `result.result.outputs`：`getVideoTaskStatusForProvider`
 * 的返回是**各家结果的联合**，只有 Hypit 那支带 `outputs`，直接访问会编译失败
 * （这也是 `HypitTaskResult` 刻意不做判别联合的原因，见 `lib/hypit.ts`）。
 */
function readProviderOutputs(
  result: Awaited<ReturnType<typeof getVideoTaskStatusForProvider>>,
): unknown[] | undefined {
  const outputs = (result.result as { outputs?: unknown } | undefined)?.outputs;
  return Array.isArray(outputs) ? outputs : undefined;
}

/**
 * 从落库的 provider 载荷里读回请求时的比例。
 *
 * `VideoTask` 没有独立的 aspectRatio 列，比例只存在于 `shanjianPayload` 快照里；
 * 读不到就返回 undefined，状态查询按渲染顺序取第一条。
 */
function readPayloadAspectRatio(task: VideoTask): "9:16" | "16:9" | "1:1" | undefined {
  const payload = task.shanjianPayload;
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>).aspectRatio;
  return value === "9:16" || value === "16:9" || value === "1:1" ? value : undefined;
}

/**
 * 严格解析 provider 列。
 *
 * 这里原本写的是 `provider === "shanjian" ? "shanjian" : "chanjing"` —— 任何非闪剪的
 * 值都被当成蝉镜，于是 HeyGen 的任务在轮询兜底时会打到蝉镜的接口上（取回必然失败或
 * 取错对象），新增第四家 provider 时更是直接错位。改成白名单校验：认不出来就跳过这个
 * 任务，宁可少轮一次，也不拿错误的凭据去打别家的上游。
 */
function normalizeProvider(provider: string): DigitalHumanProvider | null {
  return isDigitalHumanProvider(provider) ? provider : null;
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
