import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  req,
  json,
} from "./helpers";
import { POST, GET } from "@/app/api/assets/route";
import { DELETE } from "@/app/api/assets/[id]/route";
import { POST as UPLOAD_URL } from "@/app/api/assets/upload-url/route";
import jwt from "jsonwebtoken";

let user: { id: string; email: string };
let token: string;

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } });
}

describe("Assets E2E", () => {
  beforeAll(async () => {
    await cleanDatabase();
    await cleanRedis();
    const u = await prisma.user.create({
      data: {
        email: "assets-test@e2e.com",
        password: "hashed",
        name: "Assets Tester",
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

  // ─── POST /api/assets ──────────────────────────────────

  let assetId: string;

  it("creates an image asset", async () => {
    const res = await POST(
      userReq("/api/assets", {
        method: "POST",
        body: {
          name: "Product Photo",
          assetType: "image",
          url: "https://example.com/photo.jpg",
          size: 102400,
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.name).toBe("Product Photo");
    expect(body.data.assetType).toBe("image");
    expect(body.data.url).toBe("https://example.com/photo.jpg");
    expect(body.data.size).toBe(102400);
    expect(body.data.userId).toBe(user.id);
    assetId = body.data.id;

    // Verify DB record
    const dbAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    expect(dbAsset).not.toBeNull();
    expect(dbAsset!.name).toBe("Product Photo");
  });

  it("creates a video asset", async () => {
    const res = await POST(
      userReq("/api/assets", {
        method: "POST",
        body: {
          name: "Promo Video",
          assetType: "video",
          url: "https://example.com/video.mp4",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.assetType).toBe("video");
    expect(body.data.size).toBeNull();
  });

  it("creates a music asset", async () => {
    const res = await POST(
      userReq("/api/assets", {
        method: "POST",
        body: {
          name: "BGM Track",
          assetType: "music",
          url: "https://example.com/music.mp3",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.data.assetType).toBe("music");
  });

  it("rejects POST with invalid assetType", async () => {
    const res = await POST(
      userReq("/api/assets", {
        method: "POST",
        body: {
          name: "Bad Type",
          assetType: "document",
          url: "https://example.com/doc.pdf",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("assetType");
  });

  it("rejects POST with missing required fields", async () => {
    const res = await POST(
      userReq("/api/assets", {
        method: "POST",
        body: { name: "Incomplete" },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("required");
  });

  it("rejects POST without auth", async () => {
    const res = await POST(
      req("/api/assets", {
        method: "POST",
        body: {
          name: "x",
          assetType: "image",
          url: "https://example.com/x.jpg",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(401);
  });

  // ─── GET /api/assets ───────────────────────────────────

  it("lists all assets for user", async () => {
    const res = await GET(userReq("/api/assets"), undefined as never);
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.results.length).toBeGreaterThanOrEqual(3);
    expect(body.data.total).toBeGreaterThanOrEqual(3);
    expect(
      body.data.results.every((a: { userId: string }) => a.userId === user.id),
    ).toBe(true);
  });

  it("filters assets by assetType=image", async () => {
    const res = await GET(
      userReq("/api/assets?assetType=image"),
      undefined as never,
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.results.length).toBeGreaterThanOrEqual(1);
    expect(
      body.data.results.every(
        (a: { assetType: string }) => a.assetType === "image",
      ),
    ).toBe(true);
  });

  it("filters assets by assetType=video", async () => {
    const res = await GET(
      userReq("/api/assets?assetType=video"),
      undefined as never,
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(
      body.data.results.every(
        (a: { assetType: string }) => a.assetType === "video",
      ),
    ).toBe(true);
  });

  it("supports pagination", async () => {
    const res = await GET(
      userReq("/api/assets?page=1&pageSize=2"),
      undefined as never,
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.results.length).toBeLessThanOrEqual(2);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(2);
  });

  it("backfills avatar voice assets into the asset list", async () => {
    await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Backfill Avatar",
        status: "ready",
        sourceVideoUrl: "https://example.com/train.mp4",
        externalSpeakerId: "sp-backfill-1",
        speakerName: "Backfill Avatar的声音",
      },
    });

    const res = await GET(
      userReq("/api/assets?assetType=voice"),
      undefined as never,
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(
      body.data.results.some(
        (asset: { assetType: string; externalSpeakerId: string }) =>
          asset.assetType === "voice" &&
          asset.externalSpeakerId === "sp-backfill-1",
      ),
    ).toBe(true);

    const voiceAsset = await prisma.asset.findFirst({
      where: {
        userId: user.id,
        assetType: "voice",
        externalSpeakerId: "sp-backfill-1",
      },
    });
    expect(voiceAsset).not.toBeNull();
  });

  // ─── DELETE /api/assets/[id] ───────────────────────────

  it("deletes an asset", async () => {
    const res = await DELETE(
      userReq(`/api/assets/${assetId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: assetId }) },
    );
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.data.deleted).toBe(true);

    // Verify DB deletion
    const gone = await prisma.asset.findUnique({ where: { id: assetId } });
    expect(gone).toBeNull();
  });

  it("returns 404 for non-existent asset", async () => {
    const res = await DELETE(
      userReq("/api/assets/nonexistent-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "nonexistent-id" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting another user's asset", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "other-assets@e2e.com",
        password: "hashed",
        name: "Other",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const otherAsset = await prisma.asset.create({
      data: {
        userId: otherUser.id,
        name: "Other Image",
        assetType: "image",
        url: "https://example.com/other.jpg",
      },
    });

    const res = await DELETE(
      userReq(`/api/assets/${otherAsset.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: otherAsset.id }) },
    );
    expect(res.status).toBe(404);
  });

  // ─── POST /api/assets/upload-url ───────────────────────

  it("returns 503 when OSS is not configured", async () => {
    const res = await UPLOAD_URL(
      userReq("/api/assets/upload-url", {
        method: "POST",
        body: {
          fileName: "photo.jpg",
          contentType: "image/jpeg",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBe(503);

    const body = await json(res);
    expect(body.error).toContain("not configured");
  });

  it("rejects upload-url with missing fields", async () => {
    const res = await UPLOAD_URL(
      userReq("/api/assets/upload-url", {
        method: "POST",
        body: { fileName: "photo.jpg" },
      }),
      undefined as never,
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("required");
  });
});
