import { prisma } from "@/lib/prisma"
import {
  LEARNING_INJECTION_TARGETS,
  isInjectableLearningStatus,
  selectInjectedLearnings,
  type InjectedLearning,
  type LearningInjectionCandidate,
} from "@/lib/aim/learning-injection"

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function loadApprovedLearningsForGenerate(input: {
  userId: string
  projectId?: string
  topK?: number
}): Promise<InjectedLearning[]> {
  const rows = await prisma.learningCandidate.findMany({
    where: {
      reviewStatus: { in: ["approved", "promoted"] },
      targetType: { in: [...LEARNING_INJECTION_TARGETS] },
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      targetType: true,
      failureCode: true,
      payload: true,
      reviewStatus: true,
    },
  })
  const candidates: LearningInjectionCandidate[] = rows
    .filter((row) => isInjectableLearningStatus(row.reviewStatus))
    .map((row) => ({
      id: row.id,
      targetType: row.targetType,
      failureCode: row.failureCode,
      payload: asPayload(row.payload),
      reviewStatus: row.reviewStatus,
    }))
  return selectInjectedLearnings(candidates, input.topK)
}

export async function loadLearningsForAimContext(input: {
  userId: string
  projectId?: string
  useOverride: boolean
  override?: InjectedLearning[]
}): Promise<InjectedLearning[]> {
  if (input.useOverride) return input.override ?? []
  try {
    return await loadApprovedLearningsForGenerate({
      userId: input.userId,
      projectId: input.projectId,
    })
  } catch {
    return []
  }
}
