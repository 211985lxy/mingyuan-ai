import type { AimGeneration } from "@/lib/api/client"
import type { AimWorkflowStage } from "@/lib/aim-workflow"
import { getWorkflowStageForAgent } from "@/lib/aim-workflow"
import { isValidAimAgent } from "@/lib/aim-ui-config"

export interface AimWorkflowTask {
  id: string
  stage: AimWorkflowStage
  title: string
  nextAction: string
  updatedAt: string
  generation: AimGeneration
}

const PUBLISH_STATUSES = new Set(["pending_review", "ready_to_publish"])

function titleFor(item: AimGeneration) {
  return item.topicTitle?.trim() || item.taskSpec?.goal?.trim() || item.rawInput.trim().slice(0, 42) || "未命名内容"
}

function hasRetro(item: AimGeneration) {
  return Array.isArray(item.retroSnapshots) && item.retroSnapshots.length > 0
}

/**
 * A task is a derived view of an existing generation, not a second source of
 * truth. This keeps project progress visible without a new table or migration.
 */
export function deriveAimWorkflowTasks(records: AimGeneration[]): AimWorkflowTask[] {
  return records
    .filter((item) => item.workflowStatus !== "archived")
    .flatMap((item): AimWorkflowTask[] => {
      if (item.workflowStatus === "published") {
        if (hasRetro(item)) return []
        return [{ id: item.id, stage: "results", title: titleFor(item), nextAction: "填写发布结果和下一轮规则", updatedAt: item.updatedAt || item.publishedAt || item.createdAt, generation: item }]
      }

      if (PUBLISH_STATUSES.has(item.workflowStatus || "")) {
        return [{ id: item.id, stage: "publish", title: titleFor(item), nextAction: "质检、发布并登记链接", updatedAt: item.updatedAt || item.createdAt, generation: item }]
      }

      const agentId = isValidAimAgent(item.agentId) ? item.agentId : "content_producer"
      const stage = getWorkflowStageForAgent(agentId)
      return [{
        id: item.id,
        stage: stage === "direction" ? "direction" : "content",
        title: titleFor(item),
        nextAction: stage === "direction" ? "确认方向，进入内容创作" : "继续修改或生成当前稿",
        updatedAt: item.updatedAt || item.createdAt,
        generation: item,
      }]
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function groupAimWorkflowTasks(records: AimGeneration[]) {
  const tasks = deriveAimWorkflowTasks(records)
  return {
    direction: tasks.filter((task) => task.stage === "direction"),
    content: tasks.filter((task) => task.stage === "content"),
    publish: tasks.filter((task) => task.stage === "publish"),
    results: tasks.filter((task) => task.stage === "results"),
  } satisfies Record<AimWorkflowStage, AimWorkflowTask[]>
}
