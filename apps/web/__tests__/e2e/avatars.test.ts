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

const {
  mockCloneFastAvatar,
  mockCloneProfessionalAvatar,
  mockCloneImageAvatar,
  mockDeleteAsset,
} = vi.hoisted(() => ({
  mockCloneFastAvatar: vi.fn(),
  mockCloneProfessionalAvatar: vi.fn(),
  mockCloneImageAvatar: vi.fn(),
  mockDeleteAsset: vi.fn(),
}));

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
import { BRANDING_SETTING_KEYS } from "@/lib/branding-config";
import jwt from "jsonwebtoken";

let user: { id: string; email: string };
let token: string;

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
        authVideoUrl: "https://example.com/auth.mp4",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id, email: u.email };
    token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
  });

  afterAll(async () => {
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
    await prisma.systemSetting.upsert({
      where: { key: BRANDING_SETTING_KEYS.name },
      update: {
        value: "品牌授权测试",
        type: "string",
        category: "branding",
        description: "测试当前品牌名",
      },
      create: {
        key: BRANDING_SETTING_KEYS.name,
        value: "品牌授权测试",
        type: "string",
        category: "branding",
        description: "测试当前品牌名",
      },
    });

    mockCloneFastAvatar.mockResolvedValue("ext-task-fast-1");

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Fast Avatar",
          cloneType: "fast",
          videoUrl: "https://example.com/video.mp4",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
    expect(mockCloneFastAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ authText: "品牌授权测试" }),
    );
  });

  it("rejects POST with invalid cloneType", async () => {
    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Bad",
          cloneType: "invalid",
          videoUrl: "https://example.com/video.mp4",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
          videoUrl: "https://example.com/video.mp4",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "No Auth",
          cloneType: "fast",
          videoUrl: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("请先录制授权视频");

    await prisma.user.update({
      where: { id: user.id },
      data: { authVideoUrl: "https://example.com/auth.mp4" },
    });
  });

  it("creates avatar with cloneType=professional", async () => {
    mockCloneProfessionalAvatar.mockResolvedValue("ext-task-pro-1");

    const res = await POST(
      userReq("/api/avatars", {
        method: "POST",
        body: {
          name: "Pro Avatar",
          cloneType: "professional",
          videoUrl: "https://example.com/video.mp4",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
        authVideoUrl: "https://example.com/auth.mp4",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
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
          videoUrl: "https://example.com/video.mp4",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
          imageUrl: "https://example.com/photo.jpg",
          authVideoUrl: "https://example.com/auth.mp4",
          authText: "明远AIM授权",
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
      data: { userId: otherUser!.id, name: "Other To Delete", status: "ready" },
    });

    const res = await DELETE(
      userReq(`/api/avatars/${otherAvatar.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: otherAvatar.id }) },
    );
    expect(res.status).toBe(404);
  });
});
