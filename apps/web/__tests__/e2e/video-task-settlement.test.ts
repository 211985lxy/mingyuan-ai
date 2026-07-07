import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cleanDatabase,
  cleanRedis,
  disconnectAll,
  prisma,
} from "./helpers";
import { finalizeAcceptedVideoTaskSubmission } from "@/lib/video-task-settlement";

describe("Video task settlement", () => {
  let user: { id: string };

  beforeAll(async () => {
    await cleanDatabase();
    await cleanRedis();

    const createdUser = await prisma.user.create({
      data: {
        email: "video-task-settlement@e2e.com",
        password: "hashed",
        name: "Settlement Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    user = { id: createdUser.id };
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    await cleanRedis();
    await prisma.videoTask.deleteMany({ where: { userId: user.id } });
    await prisma.videoProductionPlan.deleteMany({ where: { userId: user.id } });
    await prisma.script.deleteMany({ where: { userId: user.id } });
  });

  it("reconciles an accepted submission idempotently", async () => {
    const script = await prisma.script.create({
      data: {
        userId: user.id,
        content: "用于验证 accepted submission reconcile 的文案。",
      },
    });

    const plan = await prisma.videoProductionPlan.create({
      data: {
        userId: user.id,
        scriptId: script.id,
        styleId: "style-settlement",
        videoType: "virtualman_broadcast",
        status: "confirmed",
      },
    });

    const task = await prisma.videoTask.create({
      data: {
        userId: user.id,
        scriptId: script.id,
        productionPlanId: plan.id,
        status: "pending",
        videoType: "virtualman_broadcast",
        scriptContent: script.content,
        avatarName: "Settlement Avatar",
        deliveryStatus: "pending",
      },
    });

    const first = await finalizeAcceptedVideoTaskSubmission({
      taskId: task.id,
      externalTaskId: "ext-settlement-1",
      productionPlanId: plan.id,
    });

    const second = await finalizeAcceptedVideoTaskSubmission({
      taskId: task.id,
      externalTaskId: "ext-settlement-1",
      productionPlanId: plan.id,
    });

    expect(first?.status).toBe("processing");
    expect(first?.externalTaskId).toBe("ext-settlement-1");
    expect(second?.id).toBe(task.id);
    expect(second?.externalTaskId).toBe("ext-settlement-1");

    const storedPlan = await prisma.videoProductionPlan.findUnique({
      where: { id: plan.id },
    });

    expect(storedPlan?.status).toBe("used");
  });
});
