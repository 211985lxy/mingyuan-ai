import { prisma } from "@/lib/prisma"

const WEB_ATTEMPT_ID = /^web_[a-f0-9]{24}$/

function cleanDbText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[\u{10000}-\u{10FFFF}]/gu, "")
}

function attemptWhere(id: string, userId: string, projectId?: string) {
  return { id, userId, projectId: projectId || null }
}

function sameFormats(value: unknown, expected: string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index])
}

export async function startAimGenerationAttempt(input: {
  attemptId?: string
  userId: string
  projectId?: string
  agentId: string
  rawInput: string
  targetFormats: string[]
}) {
  const rawInput = cleanDbText(input.rawInput)
  const id = input.attemptId && WEB_ATTEMPT_ID.test(input.attemptId) ? input.attemptId : undefined
  if (id) {
    const existing = await prisma.aimGeneration.findUnique({
      where: { id },
      select: { userId: true, projectId: true, agentId: true, rawInput: true, formatsRequested: true },
    })
    if (existing) {
      if (
        existing.userId !== input.userId
        || existing.projectId !== (input.projectId || null)
        || existing.agentId !== input.agentId
        || existing.rawInput !== rawInput
        || !sameFormats(existing.formatsRequested, input.targetFormats)
      ) {
        throw new Error("生成任务标识与当前请求不一致")
      }
      return { id, created: false as const }
    }
  }

  const created = await prisma.aimGeneration.create({
    data: {
      ...(id ? { id } : {}),
      userId: input.userId,
      projectId: input.projectId || null,
      agentId: input.agentId,
      rawInput,
      formatsRequested: input.targetFormats,
      status: "pending",
      workflowStatus: "draft",
    },
    select: { id: true },
  })
  return { id: created.id, created: true as const }
}

export async function discardAimGenerationAttempt(input: {
  id: string
  userId: string
  projectId?: string
  created: boolean
}) {
  if (!input.created) return
  await prisma.aimGeneration.deleteMany({
    where: {
      ...attemptWhere(input.id, input.userId, input.projectId),
      status: "pending",
    },
  })
}

export async function failAimGenerationAttempt(input: {
  id: string
  userId: string
  projectId?: string
  error: unknown
}) {
  const errorMessage = cleanDbText(input.error instanceof Error ? input.error.message : "生成失败").slice(0, 2000)
  await prisma.aimGeneration.updateMany({
    where: attemptWhere(input.id, input.userId, input.projectId),
    data: { status: "failed", errorMessage },
  })
}
