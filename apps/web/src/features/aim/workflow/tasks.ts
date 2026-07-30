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

function retroDueLabel(item: AimGeneration) {
  const publishedAt = item.publishedAt || item.updatedAt || item.createdAt
  const dueAt = new Date(new Date(publishedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
  return `发布后第 7 天复盘（${dueAt.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}）`
}

/**
 * A task is a derived view of an existing generation, not a second source of
 * truth. This keeps project progress visible without a new table or migration.
 */
/**
 * @description 派生aimworkflowtasks
 * @param records - 记录列表
 * @returns AimWorkflowTask[]
 */
export function deriveAimWorkflowTasks(records: AimGeneration[]): AimWorkflowTask[] {
  return records
    .filter((item) => item.workflowStatus !== "archived")
    .flatMap((item): AimWorkflowTask[] => {
      if (item.workflowStatus === "published") {
        if (hasRetro(item)) return []
        return [{ id: item.id, stage: "results", title: titleFor(item), nextAction: retroDueLabel(item), updatedAt: item.updatedAt || item.publishedAt || item.createdAt, generation: item }]
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

/**
 * @description 分组aimworkflowtasks
 * @param records - 记录列表
 * @returns 无返回值
 */
export function groupAimWorkflowTasks(records: AimGeneration[]) {
  const tasks = deriveAimWorkflowTasks(records)
  return {
    direction: tasks.filter((task) => task.stage === "direction"),
    content: tasks.filter((task) => task.stage === "content"),
    publish: tasks.filter((task) => task.stage === "publish"),
    results: tasks.filter((task) => task.stage === "results"),
  } satisfies Record<AimWorkflowStage, AimWorkflowTask[]>
}

/**
 * 待办条目跳进创作台的链接（带 generation + 阶段 + 项目）。
 */
export function buildAimGenerationHref(item: AimGeneration) {
  const stage = deriveAimWorkflowTasks([item])[0]?.stage || "content"
  const params = new URLSearchParams({ generationId: item.id, stage })
  if (item.projectId) params.set("projectId", item.projectId)
  else params.set("mode", "quick")
  return `/aim?${params.toString()}`
}

