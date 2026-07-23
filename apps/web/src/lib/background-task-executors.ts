import { COMPETITOR_ANALYSIS_TASK_KIND, executeCompetitorAnalysisBackgroundTask } from "@/lib/competitor-analysis/background-task"
import { INSPIRATION_PROCESS_TASK_KIND, executeInspirationBackgroundTask } from "@/features/topics/services/inspiration-background-task"
import { INSPIRATION_PIPELINE_TASK_KIND } from "@/features/topics/services/inspiration-events"
import { executeInspirationPipelineBackgroundTask } from "@/features/topics/services/inspiration-pipeline-background-task"
import { OUTBOX_SEND_TASK_KIND } from "@/features/topics/services/reply-outbox"
import { executeOutboxSendBackgroundTask } from "@/features/topics/services/reply-outbox-background-task"
import { AIM_CHANNEL_GENERATE_TASK_KIND, executeAimChannelGenerateBackgroundTask } from "@/features/aim-channels/aim-channel-generate-task"
import { AGENT_REMOTE_GENERATE_TASK_KIND, executeRemoteInvocationBackgroundTask } from "@/lib/aim/services/remote-invocation-task"
import { OPPORTUNITY_ANALYZE_TASK_KIND, executeOpportunityAnalyzeBackgroundTask } from "@/features/opportunities/services/analyze-background-task"

const executors: Record<string, (taskId: string) => Promise<boolean>> = {
  [COMPETITOR_ANALYSIS_TASK_KIND]: executeCompetitorAnalysisBackgroundTask,
  [INSPIRATION_PROCESS_TASK_KIND]: executeInspirationBackgroundTask,
  [INSPIRATION_PIPELINE_TASK_KIND]: executeInspirationPipelineBackgroundTask,
  [OUTBOX_SEND_TASK_KIND]: executeOutboxSendBackgroundTask,
  [AIM_CHANNEL_GENERATE_TASK_KIND]: executeAimChannelGenerateBackgroundTask,
  [AGENT_REMOTE_GENERATE_TASK_KIND]: executeRemoteInvocationBackgroundTask,
  [OPPORTUNITY_ANALYZE_TASK_KIND]: executeOpportunityAnalyzeBackgroundTask,
}

export const BACKGROUND_TASK_KINDS = Object.keys(executors)

/**
 * @description 执行registeredbackgroundtask
 * @param kind - kind
 * @param taskId - 任务 ID
 * @returns 无返回值
 */
export async function executeRegisteredBackgroundTask(kind: string, taskId: string) {
  const executor = executors[kind]
  return executor ? executor(taskId) : false
}

/**
 * @description 执行backgroundtaskbatch
 * @param tasks - tasks
 * @param concurrency - concurrency
 * @returns 无返回值
 */
export async function executeBackgroundTaskBatch(
  tasks: Array<{ id: string; kind: string }>,
  concurrency = 4,
) {
  let cursor = 0
  let executed = 0
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      if (await executeRegisteredBackgroundTask(task.kind, task.id)) executed += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  return executed
}
