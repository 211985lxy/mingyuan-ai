import { prisma } from "@/lib/prisma"
import { buildTaskSpecSkeleton, type TaskSpec } from "@/lib/task-spec"
import {
  applyConfirmedWorkflowBrief,
  getAimWorkflowStage,
  isAimWorkflowStage,
  parseWorkflowBriefRequest,
  parseConfirmedWorkflowBrief,
  type AimWorkflowStage,
  type ConfirmedWorkflowBrief,
} from "@/lib/aim-workflow"

export interface BuildWorkflowBriefInput {
  userId: string
  stage: AimWorkflowStage
  projectId?: string
  sourceGenerationId?: string
  goal?: string
  confirmed?: ConfirmedWorkflowBrief
}

export interface WorkflowBriefResult {
  stage: AimWorkflowStage
  projectId?: string
  sourceGenerationId?: string
  taskSpec: TaskSpec
}

function isTaskSpec(value: unknown): value is TaskSpec {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as TaskSpec).goal === "string"
    && Array.isArray((value as TaskSpec).knownFacts)
    && Array.isArray((value as TaskSpec).unknowns)
    && Array.isArray((value as TaskSpec).assumptions)
}

/** Rebuild a workflow brief from records the current user can actually access. */
export async function buildWorkflowBrief(input: BuildWorkflowBriefInput): Promise<WorkflowBriefResult> {
  if (!isAimWorkflowStage(input.stage)) throw new Error("无效的工作流阶段")
  const [project, source] = await Promise.all([
    input.projectId
      ? prisma.clientProject.findFirst({
          where: { id: input.projectId, userId: input.userId },
          select: { id: true, name: true, targetCustomer: true, industry: true, offer: true, deliveryGoal: true },
        })
      : Promise.resolve(null),
    input.sourceGenerationId
      ? prisma.aimGeneration.findFirst({
          where: { id: input.sourceGenerationId, userId: input.userId },
          select: { id: true, projectId: true, rawInput: true, taskSpec: true },
        })
      : Promise.resolve(null),
  ])

  if (input.projectId && !project) throw new Error("项目不存在或无权访问")
  if (input.sourceGenerationId && !source) throw new Error("来源内容不存在或无权访问")
  if (project && source?.projectId && source.projectId !== project.id) throw new Error("来源内容不属于当前项目")

  const sourceSpec = isTaskSpec(source?.taskSpec) ? source.taskSpec : undefined
  const base = sourceSpec || buildTaskSpecSkeleton({
    agentId: getAimWorkflowStage(input.stage).defaultAgentId,
    rawInput: source?.rawInput || input.goal || "工作流任务单",
    project: project ? {
      name: project.name,
      targetCustomer: project.targetCustomer,
      industry: project.industry,
      offer: project.offer,
      deliveryGoal: project.deliveryGoal,
    } : null,
    topicSelection: null,
    knowledgeTitles: [],
  })
  const taskSpec = applyConfirmedWorkflowBrief(base, {
    ...input.confirmed,
    goal: input.goal?.trim() || input.confirmed?.goal,
  })

  return {
    stage: input.stage,
    projectId: project?.id || source?.projectId || undefined,
    sourceGenerationId: source?.id,
    taskSpec,
  }
}

export { parseWorkflowBriefRequest }
