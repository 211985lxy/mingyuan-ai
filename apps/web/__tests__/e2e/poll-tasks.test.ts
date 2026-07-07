import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";

// ─── Mock Shanjian before imports ─────────────────────────

const { mockGetTaskInfo, mockGenerateRawVideo } = vi.hoisted(() => ({
  mockGetTaskInfo: vi.fn(),
  mockGenerateRawVideo: vi.fn(),
}));

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>();
  return {
    ...actual,
    getTaskInfo: mockGetTaskInfo,
    generateRawVideo: mockGenerateRawVideo,
  };
});

import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  req,
  cronReq,
  json,
} from "./helpers";
import { GET } from "@/app/api/cron/poll-tasks/route";

let user: { id: string };

describe("Poll Tasks Cron E2E", () => {
  beforeAll(async () => {
    await cleanDatabase();
    await cleanRedis();

    const u = await prisma.user.create({
      data: {
        email: "poll-test@e2e.com",
        password: "hashed",
        name: "Poll Tester",
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
    mockGetTaskInfo.mockReset();
    mockGenerateRawVideo.mockReset();
    await cleanRedis();
    // Clean up video tasks and avatars between tests
    await prisma.videoTask.deleteMany();
    await prisma.avatar.deleteMany({ where: { userId: user.id } });
    await prisma.asset.deleteMany({ where: { userId: user.id } });
  });

  // ─── Auth ─────────────────────────────────────────────

  it("rejects request without CRON_SECRET", async () => {
    const res = await GET(req("/api/cron/poll-tasks"));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects request with wrong secret", async () => {
    const res = await GET(
      req("/api/cron/poll-tasks", {
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  // ─── Polling stale avatars ────────────────────────────

  it("polls stale cloning avatar and updates to ready", async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Stale Avatar",
        status: "cloning",
        externalTaskId: "stale-avatar-1",
      },
    });

    // Manually set updatedAt to 20 minutes ago
    await prisma.$executeRaw`UPDATE Avatar SET updatedAt = ${twentyMinAgo} WHERE id = ${avatar.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-avatar-1",
      status: "succeed",
      result: {
        virtualmanId: "vm-polled",
        speakerId: "sp-polled",
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.polled.avatars).toBe(1);

    // Verify DB
    const updated = await prisma.avatar.findUnique({
      where: { id: avatar.id },
    });
    expect(updated!.status).toBe("ready");
    expect(updated!.externalVirtualmanId).toBe("vm-polled");
    expect(updated!.externalSpeakerId).toBe("sp-polled");

    const voiceAsset = await prisma.asset.findFirst({
      where: {
        userId: user.id,
        assetType: "voice",
        externalSpeakerId: "sp-polled",
      },
    });
    expect(voiceAsset).not.toBeNull();
    expect(voiceAsset!.name).toBe("Stale Avatar的声音");
  });

  it("polls stale cloning avatar and updates to failed", async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Stale Fail Avatar",
        status: "cloning",
        externalTaskId: "stale-avatar-fail",
      },
    });

    await prisma.$executeRaw`UPDATE Avatar SET updatedAt = ${twentyMinAgo} WHERE id = ${avatar.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-avatar-fail",
      status: "failed",
      errorCode: "Service.Error",
      errorMessage: "视频服务异常",
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const updated = await prisma.avatar.findUnique({
      where: { id: avatar.id },
    });
    expect(updated!.status).toBe("failed");
    expect(updated!.errorCode).toBe("Service.Error");
  });

  // ─── Polling stale video tasks ────────────────────────

  it("polls stale video task and updates to completed", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: { userId: user.id, name: "VT Poll Avatar", status: "ready" },
    });
    const task = await prisma.videoTask.create({
      data: {
        userId: user.id,
        avatarId: avatar.id,
        status: "processing",
        scriptContent: "Stale script",
        avatarName: "VT Poll Avatar",
        externalTaskId: "stale-video-1",
      },
    });

    await prisma.$executeRaw`UPDATE VideoTask SET updatedAt = ${tenMinAgo} WHERE id = ${task.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-video-1",
      status: "succeed",
      result: {
        videoUrl: "https://shanjian.tv/video.mp4",
        coverUrl: "https://shanjian.tv/cover.jpg",
        duration: 90,
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.polled.videos).toBe(1);

    const updated = await prisma.videoTask.findUnique({
      where: { id: task.id },
    });
    expect(updated!.status).toBe("completed");
    expect(updated!.duration).toBe(90);
    expect(updated!.completedAt).toBeTruthy();
  });

  it("polls stale video task and marks it failed without refund side effects", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: { userId: user.id, name: "VT Poll Fail", status: "ready" },
    });
    const task = await prisma.videoTask.create({
      data: {
        userId: user.id,
        avatarId: avatar.id,
        status: "processing",
        scriptContent: "Stale fail",
        avatarName: "VT Poll Fail",
        externalTaskId: "stale-video-fail",
      },
    });

    await prisma.$executeRaw`UPDATE VideoTask SET updatedAt = ${tenMinAgo} WHERE id = ${task.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-video-fail",
      status: "failed",
      errorCode: "Failed.Timeout",
      errorMessage: "处理超时",
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const updated = await prisma.videoTask.findUnique({
      where: { id: task.id },
    });
    expect(updated!.status).toBe("failed");
  });

  // ─── Polling stale voice assets ───────────────────────

  it("polls stale voice asset and updates to ready", async () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        name: "Stale Voice",
        assetType: "voice",
        url: "https://example.com/audio.wav",
        status: "processing",
        externalTaskId: "stale-voice-1",
      },
    });

    await prisma.$executeRaw`UPDATE Asset SET updatedAt = ${fifteenMinAgo} WHERE id = ${asset.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-voice-1",
      status: "succeed",
      result: {
        speakerId: "sp-voice-polled",
        demoAudioUrl: "https://example.com/demo.mp3",
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.polled.voices).toBe(1);

    const updated = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(updated!.status).toBe("ready");
    expect(updated!.externalSpeakerId).toBe("sp-voice-polled");
    expect(updated!.demoAudioUrl).toBe("https://example.com/demo.mp3");
  });

  it("binds stale cloned voice back to its avatar", async () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Avatar Pending Voice",
        status: "ready",
        externalVirtualmanId: "vm-pending-voice",
        speakerName: "Avatar Pending Voice的声音",
      },
    });

    const asset = await prisma.asset.create({
      data: {
        userId: user.id,
        sourceAvatarId: avatar.id,
        name: "Avatar Pending Voice的声音",
        assetType: "voice",
        url: "https://example.com/audio.wav",
        status: "processing",
        externalTaskId: "stale-voice-avatar-bind",
      },
    });

    await prisma.$executeRaw`UPDATE Asset SET updatedAt = ${fifteenMinAgo} WHERE id = ${asset.id}`;

    mockGetTaskInfo.mockResolvedValue({
      taskId: "stale-voice-avatar-bind",
      status: "succeed",
      result: {
        speakerId: "sp-avatar-polled",
        demoAudioUrl: "https://example.com/demo.mp3",
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const [updatedAsset, updatedAvatar] = await Promise.all([
      prisma.asset.findUnique({ where: { id: asset.id } }),
      prisma.avatar.findUnique({ where: { id: avatar.id } }),
    ]);

    expect(updatedAsset!.status).toBe("ready");
    expect(updatedAsset!.externalSpeakerId).toBe("sp-avatar-polled");
    expect(updatedAvatar!.externalSpeakerId).toBe("sp-avatar-polled");
    expect(updatedAvatar!.speakerName).toBe("Avatar Pending Voice的声音");
  });

  it("repairs missing demo video for ready avatar", async () => {
    mockGenerateRawVideo.mockResolvedValue({ taskId: "demo-repair-task" });

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Avatar Missing Demo",
        status: "ready",
        externalVirtualmanId: "vm-ready-demo",
        externalSpeakerId: "sp-ready-demo",
        speakerName: "Avatar Missing Demo的声音",
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.polled.demoRepairs).toBe(1);
    expect(mockGenerateRawVideo).toHaveBeenCalledWith({
      virtualmanId: "vm-ready-demo",
      text: "大家好，我是你的专属数字人，很高兴认识你。",
      speakerId: "sp-ready-demo",
    });

    const updatedAvatar = await prisma.avatar.findUnique({
      where: { id: avatar.id },
    });
    expect(updatedAvatar!.demoTaskId).toBe("demo-repair-task");
  });

  // ─── Non-stale entities are NOT polled ─────────────────

  it("does not poll recently updated entities", async () => {
    // Avatar updated just now (not stale)
    await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Fresh Avatar",
        status: "cloning",
        externalTaskId: "fresh-avatar",
      },
    });

    const avatar = await prisma.avatar.create({
      data: { userId: user.id, name: "For VT", status: "ready" },
    });

    // VideoTask updated just now (not stale)
    await prisma.videoTask.create({
      data: {
        userId: user.id,
        avatarId: avatar.id,
        status: "processing",
        scriptContent: "Fresh",
        avatarName: "For VT",
        externalTaskId: "fresh-video",
      },
    });

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.polled.avatars).toBe(0);
    expect(body.data.polled.videos).toBe(0);
    expect(body.data.polled.voices).toBe(0);

    // getTaskInfo should not have been called
    expect(mockGetTaskInfo).not.toHaveBeenCalled();
  });

  it("skips entities without externalTaskId", async () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "No TaskId Avatar",
        status: "cloning",
        // No externalTaskId
      },
    });

    await prisma.$executeRaw`UPDATE Avatar SET updatedAt = ${twentyMinAgo} WHERE id = ${avatar.id}`;

    const res = await GET(cronReq("/api/cron/poll-tasks"));
    expect(res.status).toBe(200);

    const body = await json(res);
    // Avatar is "found" as stale but skipped because no externalTaskId
    expect(body.data.polled.avatars).toBe(0);
    expect(mockGetTaskInfo).not.toHaveBeenCalled();
  });
});
