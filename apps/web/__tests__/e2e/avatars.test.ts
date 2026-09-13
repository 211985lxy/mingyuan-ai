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

const E2E_OSS_AUTH_VIDEO_URL = "https://e2e-assets.oss-cn-e2e.aliyuncs.com/auth-video.mp4";
const E2E_AUTH_TEXT = "我是E2E测试用户，同意授权克隆我的数字人形象";

const {
  mockCloneFastAvatar,
  mockCloneProfessionalAvatar,
  mockCloneImageAvatar,
  mockDeleteAsset,
} = vi.hoisted(() => {
  // 授权视频必须是受管 OSS URL（isManagedOssUrl 校验），这里配置一套
  // 仅用于签名的假 OSS 参数；签名是本地 HMAC 计算，不会发起网络请求。
  process.env.OSS_REGION = "oss-cn-e2e";
  process.env.OSS_ACCESS_KEY_ID = "e2e-oss-key";
  process.env.OSS_ACCESS_KEY_SECRET = "e2e-oss-secret";
  process.env.OSS_BUCKET = "e2e-assets";
  // 成功提交的克隆任务会占用并发槽直到终态，E2E 内没有回调环节释放，
  // 因此放宽上限避免第二个任务 429。
  process.env.SHANJIAN_MAX_CONCURRENT = "10";
  return {
    mockCloneFastAvatar: vi.fn(),
    mockCloneProfessionalAvatar: vi.fn(),
    mockCloneImageAvatar: vi.fn(),
    mockDeleteAsset: vi.fn(),
  };
});

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>();
  return {
    ...actual,
    cloneFastAvatar: mockCloneFastAvatar,
    cloneProfessionalAvatar: mockCloneProfessionalAvatar,
    cloneImageAvatar: mockCloneImageAvatar,
    deleteAsset: mockDeleteAsset,
  };
});

import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  req,
  json,
} from "./helpers";
import { POST, GET } from "@/app/api/avatars/route";
import { GET as GET_BY_ID, DELETE } from "@/app/api/avatars/[id]/route";
import jwt from "jsonwebtoken";

let user: { id: string; email: string };
let token: string;
let projectId: string;

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } });
}

describe("Avatars E2E", () => {
  beforeAll(async () => {
    await cleanDatabase();
    await cleanRedis();
    const u = await prisma.user.create({
      data: {
        email: "avatar-test@e2e.com",
        password: "hashed",
        name: "Avatar Tester",
        authVideoUrl: E2E_OSS_AUTH_VIDEO_URL,
        authVideoText: E2E_AUTH_TEXT,
        authVideoConfirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id, email: u.email };
    token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    const project = await prisma.clientProject.create({
      data: { userId: user.id, name: "E2E 数字人项目" },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    // 清理本文件注入的 process.env，避免同进程内污染后续测试文件的 env 快照
    delete process.env.OSS_REGION;
    delete process.env.OSS_ACCESS_KEY_ID;
    delete process.env.OSS_ACCESS_KEY_SECRET;
    delete process.env.OSS_BUCKET;
    delete process.env.SHANJIAN_MAX_CONCURRENT;
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(() => {
    mockCloneFastAvatar.mockReset();
    mockCloneProfessionalAvatar.mockReset();
    mockCloneImageAvatar.mockReset();
    mockDeleteAsset.mockReset();
  });

  // ─── POST /api/avatars ──────────────────────────────────

  it("creates avatar with cloneType=fast", async () => {
    mockCloneFastAvatar.mockResolvedValue("ext-task-fast-1");

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Fast Avatar",
          cloneType: "fast",
          projectId,
          videoUrl: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.name).toBe("Fast Avatar");
    expect(body.data.status).toBe("cloning");
    expect(body.data.externalTaskId).toBe("ext-task-fast-1");
    expect(body.data.userId).toBe(user.id);

    // Verify DB record
    const dbAvatar = await prisma.avatar.findUnique({
      where: { id: body.data.id },
    });
    expect(dbAvatar).not.toBeNull();
    expect(dbAvatar!.externalTaskId).toBe("ext-task-fast-1");
    expect(dbAvatar!.projectId).toBe(projectId);
    expect(dbAvatar!.provider).toBe("shanjian");
    expect(mockCloneFastAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ authText: E2E_AUTH_TEXT }),
    );
  });

  it("rejects POST with invalid cloneType", async () => {
    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Bad",
          cloneType: "invalid",
          projectId,
          videoUrl: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("cloneType");
  });

  it("rejects POST with missing name", async () => {
    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          cloneType: "fast",
          projectId,
          videoUrl: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects fast clone without videoUrl", async () => {
    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "No Video",
          cloneType: "fast",
          projectId,
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("videoUrl");
  });

  it("rejects POST without authVideoUrl", async () => {
    await prisma.user.update({
      where: { id: user.id },
      data: { authVideoUrl: null },
    });

    try {
      const res = await POST(
        userReq("/api/avatars", {
          method: "POST",
          body: {
            name: "No Auth",
            cloneType: "fast",
            projectId,
            videoUrl: "https://example.com/video.mp4",
          },
        }),
        undefined as never,
      );
      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("授权原文");
    } finally {
      // 断言失败也必须恢复授权视频，避免污染后续用例
      await prisma.user.update({
        where: { id: user.id },
        data: { authVideoUrl: E2E_OSS_AUTH_VIDEO_URL },
      });
    }
  });

  it("creates avatar with cloneType=professional", async () => {
    mockCloneProfessionalAvatar.mockResolvedValue("ext-task-pro-1");

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Pro Avatar",
          cloneType: "professional",
          projectId,
          videoUrl: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.externalTaskId).toBe("ext-task-pro-1");
  });

  it("allows professional clone for another authenticated user", async () => {
    const poorUser = await prisma.user.create({
      data: {
        email: "poor-avatar@e2e.com",
        password: "hashed",
        name: "Poor",
        authVideoUrl: E2E_OSS_AUTH_VIDEO_URL,
        authVideoText: E2E_AUTH_TEXT,
        authVideoConfirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const poorProject = await prisma.clientProject.create({
      data: { userId: poorUser.id, name: "另一个用户的项目" },
    });
    const poorToken = jwt.sign(
      { id: poorUser.id, email: poorUser.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );

    const res = await POST(
      req("/api/avatars", {
        method: "POST",
        body: {
          name: "Pro Avatar",
          cloneType: "professional",
          projectId: poorProject.id,
          videoUrl: "https://example.com/video.mp4",
        },
        headers: { Authorization: `Bearer ${poorToken}` },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);
  });

  it("creates avatar with cloneType=image", async () => {
    mockCloneImageAvatar.mockResolvedValue("ext-task-img-1");

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Image Avatar",
          cloneType: "image",
          projectId,
          imageUrl: "https://example.com/photo.jpg",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.externalTaskId).toBe("ext-task-img-1");
  });

  // ─── GET /api/avatars ──────────────────────────────────

  it("lists avatars for the user", async () => {
    const res = await GET(userReq("/api/avatars"), undefined as never);
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.results.length).toBeGreaterThanOrEqual(1);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    expect(
      body.data.results.every((a: { userId: string }) => a.userId === user.id),
    ).toBe(true);
  });

  it("filters avatars by status", async () => {
    const res = await GET(
      userReq("/api/avatars?status=cloning"),
      undefined as never,
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(
      body.data.results.every(
        (a: { status: string }) => a.status === "cloning",
      ),
    ).toBe(true);
  });

  // ─── GET /api/avatars/[id] ──────────────────────────────

  it("gets avatar by ID", async () => {
    const avatar = await prisma.avatar.findFirst({
      where: { userId: user.id },
    });
    expect(avatar).not.toBeNull();

    const res = await GET_BY_ID(userReq(`/api/avatars/${avatar!.id}`), {
      params: Promise.resolve({ id: avatar!.id }),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.id).toBe(avatar!.id);
  });

  it("returns 404 for avatar owned by another user", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "other-avatar@e2e.com",
        password: "hashed",
        name: "Other",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const otherAvatar = await prisma.avatar.create({
      data: { userId: otherUser.id, name: "Other Avatar", status: "ready" },
    });

    const res = await GET_BY_ID(userReq(`/api/avatars/${otherAvatar.id}`), {
      params: Promise.resolve({ id: otherAvatar.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for non-existent avatar", async () => {
    const res = await GET_BY_ID(userReq("/api/avatars/nonexistent-id"), {
      params: Promise.resolve({ id: "nonexistent-id" }),
    });
    expect(res.status).toBe(404);
  });

  // ─── DELETE /api/avatars/[id] ───────────────────────────

  it("deletes an avatar", async () => {
    mockDeleteAsset.mockResolvedValue(undefined);

    const voiceAsset = await prisma.asset.create({
      data: {
        userId: user.id,
        name: "To Delete的声音",
        assetType: "voice",
        url: "https://example.com/voice.wav",
        status: "ready",
        externalSpeakerId: "sp-to-delete",
      },
    });

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "To Delete",
        status: "ready",
        provider: "shanjian",
        externalVirtualmanId: "vm-to-delete",
        externalSpeakerId: "sp-to-delete",
      },
    });

    const res = await DELETE(
      userReq(`/api/avatars/${avatar.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: avatar.id }) },
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.deleted).toBe(true);

    // Verify DB deletion
    const gone = await prisma.avatar.findUnique({ where: { id: avatar.id } });
    expect(gone).toBeNull();

    const preservedVoice = await prisma.asset.findUnique({
      where: { id: voiceAsset.id },
    });
    expect(preservedVoice).not.toBeNull();
    expect(mockDeleteAsset).toHaveBeenCalledTimes(1);
    expect(mockDeleteAsset).toHaveBeenCalledWith("vm-to-delete");
  });

  it("cannot delete another user's avatar", async () => {
    const otherUser = await prisma.user.findFirst({
      where: { email: "other-avatar@e2e.com" },
    });
    const otherAvatar = await prisma.avatar.create({
      data: {
        userId: otherUser!.id,
        name: "Other To Delete",
        status: "ready",
        provider: "shanjian",
      },
    });

    const res = await DELETE(
      userReq(`/api/avatars/${otherAvatar.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: otherAvatar.id }) },
    );
    expect(res.status).toBe(404);
  });
});
