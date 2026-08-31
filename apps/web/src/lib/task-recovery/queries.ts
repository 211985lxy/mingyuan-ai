import { prisma } from "@/lib/prisma";
import {
  AVATAR_POLL_DELAY_MS,
  PENDING_SUBMISSION_TIMEOUT_MS,
  VIDEO_POLL_DELAY_MS,
  VOICE_POLL_DELAY_MS,
} from "./contracts";

export async function loadTaskRecoveryCandidates(now: Date) {
  return Promise.all([
    prisma.avatar.findMany({
      where: { status: "cloning", updatedAt: { lt: new Date(now.getTime() - AVATAR_POLL_DELAY_MS) } },
      take: 50,
    }),
    prisma.videoTask.findMany({
      where: { status: "processing", updatedAt: { lt: new Date(now.getTime() - VIDEO_POLL_DELAY_MS) } },
      take: 50,
    }),
    prisma.videoTask.findMany({
      where: {
        status: "pending",
        externalTaskId: null,
        createdAt: { lt: new Date(now.getTime() - PENDING_SUBMISSION_TIMEOUT_MS) },
      },
      take: 50,
    }),
    prisma.asset.findMany({
      where: { assetType: "voice", status: "processing", updatedAt: { lt: new Date(now.getTime() - VOICE_POLL_DELAY_MS) } },
      take: 50,
    }),
    prisma.avatar.findMany({
      where: {
        status: "ready",
        externalVirtualmanId: { not: null },
        externalSpeakerId: null,
        sourceVideoUrl: { not: null },
      },
      take: 20,
    }),
    prisma.avatar.findMany({
      where: {
        status: "ready",
        externalVirtualmanId: { not: null },
        externalSpeakerId: { not: null },
        demoTaskId: null,
        demoVideoUrl: null,
      },
      take: 20,
    }),
    prisma.avatar.findMany({
      where: { demoTaskId: { not: null }, demoVideoUrl: null, status: "ready" },
      take: 20,
    }),
  ]);
}

export type TaskRecoveryCandidates = Awaited<
  ReturnType<typeof loadTaskRecoveryCandidates>
>;
