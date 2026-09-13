import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  req,
  json,
} from "./helpers";
import { POST } from "@/app/api/webhook/shanjian/route";

let user: { id: string };

describe("Webhook Shanjian E2E", () => {
  beforeAll(async () => {
    await cleanDatabase();
    await cleanRedis();

    const u = await prisma.user.create({
      data: {
        email: "webhook-test@e2e.com",
        password: "hashed",
        name: "Webhook Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id };
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    await cleanRedis();
  });

  // ─── Avatar Callbacks ──────────────────────────────────

  describe("Avatar callbacks", () => {
    it("handles avatar success callback", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "Webhook Avatar",
          status: "cloning",
          externalTaskId: "avatar-webhook-success",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "avatar-webhook-success",
            status: "succeed",
            result: {
              virtualmanId: "vm-from-webhook",
              speakerId: "sp-from-webhook",
            },
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);

      // Verify DB was updated
      const updated = await prisma.avatar.findUnique({
        where: { id: avatar.id },
      });
      expect(updated!.status).toBe("ready");
      expect(updated!.externalVirtualmanId).toBe("vm-from-webhook");
      expect(updated!.externalSpeakerId).toBe("sp-from-webhook");

      const voiceAsset = await prisma.asset.findFirst({
        where: {
          userId: user.id,
          assetType: "voice",
          externalSpeakerId: "sp-from-webhook",
        },
      });
      expect(voiceAsset).not.toBeNull();
      expect(voiceAsset!.name).toBe("Webhook Avatar的声音");
    });

    it("handles avatar failure callback", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "Failing Avatar",
          status: "cloning",
          externalTaskId: "avatar-webhook-fail",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "avatar-webhook-fail",
            status: "failed",
            errorCode: "Invalid.Face.Detection",
            errorMessage: "未检测到人脸",
          },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.avatar.findUnique({
        where: { id: avatar.id },
      });
      expect(updated!.status).toBe("failed");
      expect(updated!.errorCode).toBe("Invalid.Face.Detection");
      expect(updated!.errorMessage).toBe("未检测到人脸");
    });

    it("skips processing for already-terminal avatar", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "Already Ready",
          status: "ready",
          externalTaskId: "avatar-already-ready",
          externalVirtualmanId: "original-vm",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "avatar-already-ready",
            status: "succeed",
            result: { virtualmanId: "new-vm-id" },
          },
        }),
      );
      expect(res.status).toBe(200);

      // Verify it was NOT updated (still has original virtualmanId)
      const unchanged = await prisma.avatar.findUnique({
        where: { id: avatar.id },
      });
      expect(unchanged!.externalVirtualmanId).toBe("original-vm");
    });
  });

  // ─── Video Task Callbacks ──────────────────────────────

  describe("Video task callbacks", () => {
    it("handles video success callback", async () => {
      const avatar = await prisma.avatar.create({
        data: { userId: user.id, name: "VT Avatar", status: "ready" },
      });
      const task = await prisma.videoTask.create({
        data: {
          userId: user.id,
          avatarId: avatar.id,
          status: "processing",
          scriptContent: "Test script",
          avatarName: "VT Avatar",
          externalTaskId: "video-webhook-success",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "video-webhook-success",
            status: "succeed",
            result: {
              videoUrl: "https://shanjian.tv/output/video.mp4",
              coverUrl: "https://shanjian.tv/output/cover.jpg",
              duration: 120,
            },
          },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.videoTask.findUnique({
        where: { id: task.id },
      });
      expect(updated!.status).toBe("completed");
      // OSS not configured in test, so transferFromUrl returns original URLs
      expect(updated!.videoUrl).toBeTruthy();
      expect(updated!.coverUrl).toBeTruthy();
      expect(updated!.duration).toBe(120);
      expect(updated!.completedAt).toBeTruthy();
      expect(updated!.deliveryStatus).toBe("degraded");
      expect(updated!.deliveryWarning).toContain("持久存储");
    });

    it("handles video failure callback without refund side effects", async () => {
      const avatar = await prisma.avatar.create({
        data: { userId: user.id, name: "VT Avatar Fail", status: "ready" },
      });
      const task = await prisma.videoTask.create({
        data: {
          userId: user.id,
          avatarId: avatar.id,
          status: "processing",
          scriptContent: "Failing script",
          avatarName: "VT Avatar Fail",
          externalTaskId: "video-webhook-fail",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "video-webhook-fail",
            status: "failed",
            errorCode: "Failed.Timeout",
            errorMessage: "处理超时",
          },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.videoTask.findUnique({
        where: { id: task.id },
      });
      expect(updated!.status).toBe("failed");
      expect(updated!.errorCode).toBe("Failed.Timeout");
      expect(updated!.errorMessage).toBe("处理超时");
    });

    it("skips video update for already-terminal task", async () => {
      const avatar = await prisma.avatar.create({
        data: { userId: user.id, name: "VT Done", status: "ready" },
      });
      const task = await prisma.videoTask.create({
        data: {
          userId: user.id,
          avatarId: avatar.id,
          status: "completed",
          scriptContent: "Already done",
          avatarName: "VT Done",
          externalTaskId: "video-already-done",
          videoUrl: "https://example.com/original.mp4",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "video-already-done",
            status: "succeed",
            result: { videoUrl: "https://new.url/video.mp4" },
          },
        }),
      );
      expect(res.status).toBe(200);

      const unchanged = await prisma.videoTask.findUnique({
        where: { id: task.id },
      });
      expect(unchanged!.videoUrl).toBe("https://example.com/original.mp4");
    });
  });

  // ─── Voice Callbacks ───────────────────────────────────

  describe("Voice callbacks", () => {
    it("handles voice success callback", async () => {
      const asset = await prisma.asset.create({
        data: {
          userId: user.id,
          name: "Voice Clone",
          assetType: "voice",
          url: "https://example.com/audio.wav",
          status: "processing",
          externalTaskId: "voice-webhook-success",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "voice-webhook-success",
            status: "succeed",
            result: {
              speakerId: "sp-cloned",
              demoAudioUrl: "https://example.com/demo.mp3",
            },
          },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.asset.findUnique({
        where: { id: asset.id },
      });
      expect(updated!.status).toBe("ready");
      expect(updated!.externalSpeakerId).toBe("sp-cloned");
      expect(updated!.demoAudioUrl).toBe("https://example.com/demo.mp3");
    });

    it("binds cloned voice back to its avatar", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "Avatar With Pending Voice",
          status: "ready",
          externalVirtualmanId: "vm-pending-voice",
          speakerName: "Avatar With Pending Voice的声音",
        },
      });

      const asset = await prisma.asset.create({
        data: {
          userId: user.id,
          sourceAvatarId: avatar.id,
          name: "Avatar With Pending Voice的声音",
          assetType: "voice",
          url: "https://example.com/audio.wav",
          status: "processing",
          externalTaskId: "voice-webhook-bind-avatar",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "voice-webhook-bind-avatar",
            status: "succeed",
            result: {
              speakerId: "sp-avatar-bound",
              demoAudioUrl: "https://example.com/demo.mp3",
            },
          },
        }),
      );
      expect(res.status).toBe(200);

      const [updatedAsset, updatedAvatar] = await Promise.all([
        prisma.asset.findUnique({ where: { id: asset.id } }),
        prisma.avatar.findUnique({ where: { id: avatar.id } }),
      ]);

      expect(updatedAsset!.status).toBe("ready");
      expect(updatedAsset!.externalSpeakerId).toBe("sp-avatar-bound");
      expect(updatedAvatar!.externalSpeakerId).toBe("sp-avatar-bound");
      expect(updatedAvatar!.speakerName).toBe(
        "Avatar With Pending Voice的声音",
      );
    });

    it("handles voice failure callback", async () => {
      const asset = await prisma.asset.create({
        data: {
          userId: user.id,
          name: "Voice Fail",
          assetType: "voice",
          url: "https://example.com/bad-audio.wav",
          status: "processing",
          externalTaskId: "voice-webhook-fail",
        },
      });

      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "voice-webhook-fail",
            status: "failed",
            errorCode: "Invalid.Speech",
            errorMessage: "语音质量不达标",
          },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.asset.findUnique({
        where: { id: asset.id },
      });
      expect(updated!.status).toBe("failed");
      expect(updated!.errorCode).toBe("Invalid.Speech");
    });
  });

  // ─── Edge Cases ────────────────────────────────────────

  describe("Edge cases", () => {
    it("deduplicates webhook via Redis (second call is no-op)", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "Dedup Avatar",
          status: "cloning",
          externalTaskId: "dedup-task-1",
        },
      });

      // First call
      await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "dedup-task-1",
            status: "succeed",
            result: { virtualmanId: "vm-first" },
          },
        }),
      );

      const afterFirst = await prisma.avatar.findUnique({
        where: { id: avatar.id },
      });
      expect(afterFirst!.status).toBe("ready");
      expect(afterFirst!.externalVirtualmanId).toBe("vm-first");

      // Manually revert DB to cloning to prove second call won't process
      await prisma.avatar.update({
        where: { id: avatar.id },
        data: { status: "cloning", externalVirtualmanId: null },
      });

      // Second call with same taskId (Redis dedup should skip)
      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "dedup-task-1",
            status: "succeed",
            result: { virtualmanId: "vm-second" },
          },
        }),
      );
      expect(res.status).toBe(200);

      // Still cloning since second call was deduped
      const afterSecond = await prisma.avatar.findUnique({
        where: { id: avatar.id },
      });
      expect(afterSecond!.status).toBe("cloning");
      expect(afterSecond!.externalVirtualmanId).toBeNull();
    });

    it("returns 200 for unknown taskId (no crash)", async () => {
      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {
            taskId: "completely-unknown-task-id",
            status: "succeed",
            result: {},
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);
    });

    it("returns 200 for empty body", async () => {
      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: {},
        }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 200 for missing taskId", async () => {
      const res = await POST(
        req("/api/webhook/shanjian", {
          method: "POST",
          body: { status: "succeed" },
        }),
      );
      expect(res.status).toBe(200);
    });
  });
});
