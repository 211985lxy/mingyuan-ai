import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import {
  BACKGROUND_TASK_STATUS,
  claimBackgroundTask,
  completeBackgroundTask,
  enqueueBackgroundTask,
  reclaimExpiredBackgroundTaskLeases,
} from "@/lib/background-tasks"
import { prisma } from "@/lib/prisma"

const createdTaskIds: string[] = []

async function createTask(idempotencyKey = randomUUID()) {
  const task = await enqueueBackgroundTask(prisma, {
    kind: "e2e_background_task",
    aggregateType: "e2e",
    aggregateId: randomUUID(),
    idempotencyKey,
  })
  createdTaskIds.push(task.id)
  return task
}

describe("background task database lifecycle", () => {
  afterAll(async () => {
    await prisma.backgroundTask.deleteMany({ where: { id: { in: createdTaskIds } } })
    await prisma.$disconnect()
  })

  it("allows exactly one concurrent worker to claim a task", async () => {
    const task = await createTask()
    const [first, second] = await Promise.all([
      claimBackgroundTask(prisma, task.id),
      claimBackgroundTask(prisma, task.id),
    ])
    const claimed = [first, second].filter((value): value is NonNullable<typeof value> => value !== null)

    expect(claimed).toHaveLength(1)
    expect(claimed[0].status).toBe(BACKGROUND_TASK_STATUS.leased)
    expect(claimed[0].attempt).toBe(1)

    const completed = await completeBackgroundTask(prisma, claimed[0].id, claimed[0].leaseToken!)
    expect(completed.count).toBe(1)

    const stored = await prisma.backgroundTask.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe(BACKGROUND_TASK_STATUS.succeeded)
    expect(stored.leaseToken).toBeNull()
  })

  it("requeues expired leases for recovery", async () => {
    const task = await createTask()
    const claimed = await claimBackgroundTask(prisma, task.id, new Date("2026-07-19T00:00:00.000Z"), 1_000)
    expect(claimed).not.toBeNull()

    const reclaimed = await reclaimExpiredBackgroundTaskLeases(prisma, new Date("2026-07-19T00:00:02.000Z"))
    expect(reclaimed.count).toBeGreaterThanOrEqual(1)

    const stored = await prisma.backgroundTask.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe(BACKGROUND_TASK_STATUS.retryWait)
    expect(stored.leaseToken).toBeNull()
    expect(stored.availableAt).toEqual(new Date("2026-07-19T00:00:02.000Z"))
  })
})
