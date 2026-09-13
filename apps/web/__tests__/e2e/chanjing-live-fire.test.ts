import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";

// ─── 蝉镜默认链路 live-fire ───────────────────────────────
// 不 mock 供应商客户端：在本进程内启动一个假的蝉镜 Open API，
// 让真实 HTTP 客户端（src/lib/chanjing.ts）走完整网络路径：
// access_token → create_video → 轮询状态 → 回调复核 → 结算。
// 成品素材 URL 使用公网域名；OSS 未配置时转存走降级路径，
// 不会真正发起下载，因此整个文件不产生任何外部网络请求。

const CJ_PORT = 4789;
const CJ_APP_ID = "e2e-chanjing-app";
const CJ_SECRET = "e2e-chanjing-secret";
const CJ_WEBHOOK_SECRET = "e2e-chanjing-webhook-secret";

interface FakePerson {
  status: number;
  pic_url?: string;
  preview_url?: string;
  audio_man_id?: string;
  err_reason?: string;
}

interface FakeVideo {
  status: number;
  video_url?: string;
  preview_url?: string;
  duration?: number;
  msg?: string;
}

const { chanjingState } = vi.hoisted(() => {
  process.env.CHANJING_APP_ID = "e2e-chanjing-app";
  process.env.CHANJING_SECRET_KEY = "e2e-chanjing-secret";
  process.env.CHANJING_BASE_URL = `http://127.0.0.1:4789`;
  process.env.CHANJING_AUTH_TEXT = "E2E蝉镜授权文案";
  process.env.CHANJING_WEBHOOK_SECRET = "e2e-chanjing-webhook-secret";
  process.env.CHANJING_WEBHOOK_URL = "https://aim.example.com/api/webhook/chanjing";
  // 本文件聚焦默认供应商蝉镜；结束后恢复为套件统一的闪剪配置
  process.env.DIGITAL_HUMAN_PROVIDER = "chanjing";
  return {
    chanjingState: {
      tokenCalls: 0,
      expireTokenOnce: false,
      videoQueries: new Map<string, number>(),
      people: new Map<string, FakePerson>(),
      videos: new Map<string, FakeVideo>(),
      createVideoCalls: [] as Array<Record<string, unknown>>,
    },
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
import { POST } from "@/app/api/webhook/chanjing/route";
import {
  createDigitalHumanVideo,
  getVideoTaskInfo,
} from "@/lib/chanjing";
import { AVATAR_DEMO_TEXT } from "@/lib/avatar-demo";

let server: http.Server;
let user: { id: string };

function cjReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, {
    ...opts,
    headers: { "x-webhook-secret": CJ_WEBHOOK_SECRET },
  });
}

function jsonBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => resolve(data));
  });
}

describe("ChanJing live-fire (real HTTP client + fake vendor)", () => {
  beforeAll(async () => {
    server = http.createServer((reqMsg, res) => {
      void (async () => {
        const url = new URL(reqMsg.url ?? "/", `http://127.0.0.1:${CJ_PORT}`);
        const body = reqMsg.method === "POST" ? JSON.parse(await jsonBody(reqMsg) || "{}") : {};

        if (url.pathname === "/open/v1/access_token") {
          if (body.app_id !== CJ_APP_ID || body.secret_key !== CJ_SECRET) {
            res.end(JSON.stringify({ code: 10401, msg: "invalid credentials" }));
            return;
          }
          chanjingState.tokenCalls += 1;
          res.end(JSON.stringify({
            code: 0,
            data: { access_token: `tok-${chanjingState.tokenCalls}`, expire_in: 3600 },
            trace_id: "t-0",
          }));
          return;
        }

        // 业务端点必须携带最近签发的 access_token
        const token = reqMsg.headers.access_token;
        if (chanjingState.expireTokenOnce) {
          chanjingState.expireTokenOnce = false;
          res.end(JSON.stringify({ code: 10400, msg: "token expired" }));
          return;
        }
        if (typeof token !== "string" || token !== `tok-${chanjingState.tokenCalls}`) {
          res.end(JSON.stringify({ code: 10400, msg: "bad token" }));
          return;
        }

        if (url.pathname === "/open/v1/create_video" && reqMsg.method === "POST") {
          chanjingState.createVideoCalls.push(body);
          const id = `cj-video-${chanjingState.createVideoCalls.length}`;
          chanjingState.videos.set(id, { status: 20 });
          res.end(JSON.stringify({ code: 0, data: id, trace_id: "t-1" }));
          return;
        }

        if (url.pathname === "/open/v1/video" && reqMsg.method === "GET") {
          const id = url.searchParams.get("id") ?? "";
          chanjingState.videoQueries.set(id, (chanjingState.videoQueries.get(id) ?? 0) + 1);
          const video = chanjingState.videos.get(id);
          if (!video) {
            res.end(JSON.stringify({ code: 10404, msg: "video not found" }));
            return;
          }
          // 与真实 API 一致：同时返回数值 status 与规范枚举 queue_status
          const queueStatus =
            video.status === 30 ? "completed"
              : video.status >= 40 ? "failed"
                : "processing";
          res.end(JSON.stringify({ code: 0, data: { id, queue_status: queueStatus, ...video }, trace_id: "t-2" }));
          return;
        }

        if (url.pathname === "/open/v1/customised_person" && reqMsg.method === "GET") {
          const id = url.searchParams.get("id") ?? "";
          const person = chanjingState.people.get(id);
          if (!person) {
            res.end(JSON.stringify({ code: 10404, msg: "person not found" }));
            return;
          }
          res.end(JSON.stringify({ code: 0, data: { id, ...person }, trace_id: "t-3" }));
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ code: 404, msg: `unknown route ${url.pathname}` }));
      })();
    });

    await new Promise<void>((resolve) => server.listen(CJ_PORT, "127.0.0.1", resolve));

    await cleanDatabase();
    await cleanRedis();
    const u = await prisma.user.create({
      data: {
        email: "chanjing-live@e2e.com",
        password: "hashed",
        name: "ChanJing Live Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id };
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // 恢复套件级环境，避免影响按字母序在后的闪剪用例
    process.env.DIGITAL_HUMAN_PROVIDER = "shanjian";
    delete process.env.CHANJING_APP_ID;
    delete process.env.CHANJING_SECRET_KEY;
    delete process.env.CHANJING_BASE_URL;
    delete process.env.CHANJING_AUTH_TEXT;
    delete process.env.CHANJING_WEBHOOK_SECRET;
    delete process.env.CHANJING_WEBHOOK_URL;
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    chanjingState.expireTokenOnce = false;
    chanjingState.videoQueries.clear();
    chanjingState.createVideoCalls.length = 0;
    await cleanRedis();
    await prisma.videoTask.deleteMany();
    await prisma.avatar.deleteMany();
    await prisma.asset.deleteMany();
  });

  // ─── 真实 HTTP 客户端 ─────────────────────────────────

  describe("ChanJing client", () => {
    it("caches the access token across requests", async () => {
      const callsBefore = chanjingState.tokenCalls;
      chanjingState.videos.set("cj-cache-1", { status: 20 });

      const first = await getVideoTaskInfo("cj-cache-1");
      const second = await getVideoTaskInfo("cj-cache-1");
      expect(first.status).toBe("processing");
      expect(second.status).toBe("processing");
      expect(chanjingState.tokenCalls).toBe(callsBefore + 1);
    });

    it("submits a compliant 9:16 broadcast payload", async () => {
      const { taskId } = await createDigitalHumanVideo({
        personId: "cj-person-x",
        audioManId: "sp-cj-x",
        text: "大家好，今天分享一个话题。",
      });
      expect(taskId).toMatch(/^cj-video-/);

      const payload = chanjingState.createVideoCalls.at(-1) as Record<string, any>;
      expect(payload.person.id).toBe("cj-person-x");
      expect(payload.audio.tts.text).toEqual(["大家好，今天分享一个话题。"]);
      expect(payload.audio.tts.audio_man).toBe("sp-cj-x");
      expect(payload.add_compliance_watermark).toBe(true);
      expect(payload.screen_width).toBe(1080);
      expect(payload.screen_height).toBe(1920);
      expect(payload.callback).toBe("https://aim.example.com/api/webhook/chanjing");
    });

    it("maps video status 30 to succeed and 41 to failed", async () => {
      chanjingState.videos.set("cj-map-1", {
        status: 30,
        video_url: "https://cdn.example.com/out/map1.mp4",
        preview_url: "https://cdn.example.com/out/map1.jpg",
        duration: 42,
      });
      const succeed = await getVideoTaskInfo("cj-map-1");
      expect(succeed.status).toBe("succeed");
      expect(succeed.result?.videoUrl).toBe("https://cdn.example.com/out/map1.mp4");
      expect(succeed.result?.duration).toBe(42);

      chanjingState.videos.set("cj-map-2", { status: 41, msg: "合成失败" });
      const failed = await getVideoTaskInfo("cj-map-2");
      expect(failed.status).toBe("failed");
      expect(failed.errorMessage).toBe("合成失败");
    });

    it("refreshes the token exactly once on 10400", async () => {
      chanjingState.videos.set("cj-retry-1", { status: 20 });
      const callsBefore = chanjingState.tokenCalls;
      chanjingState.expireTokenOnce = true;

      const result = await getVideoTaskInfo("cj-retry-1");
      expect(result.status).toBe("processing");
      expect(chanjingState.tokenCalls).toBe(callsBefore + 1);
    });
  });

  // ─── 蝉镜回调路由（真实复核 + 结算）──────────────────

  describe("ChanJing webhook", () => {
    async function seedProcessingTask(externalTaskId: string) {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "CJ Avatar",
          status: "ready",
          provider: "chanjing",
          externalVirtualmanId: "vm-cj-1",
          externalSpeakerId: "sp-cj-1",
        },
      });
      return prisma.videoTask.create({
        data: {
          userId: user.id,
          avatarId: avatar.id,
          status: "processing",
          provider: "chanjing",
          scriptContent: "蝉镜 live-fire 文案",
          avatarName: "CJ Avatar",
          externalTaskId,
        },
      });
    }

    it("settles a successful callback via vendor re-query (degraded transfer)", async () => {
      const task = await seedProcessingTask("cj-w-success");
      chanjingState.videos.set("cj-w-success", {
        status: 30,
        video_url: "https://cdn.example.com/out/final.mp4",
        preview_url: "https://cdn.example.com/out/final.jpg",
        duration: 66,
      });

      const res = await POST(
        cjReq("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-w-success", status: 30 },
        }),
      );
      expect(res.status).toBe(200);
      expect((await json(res)).ok).toBe(true);

      // 回调后必须向供应商复核，而不是信任回调内容
      expect(chanjingState.videoQueries.get("cj-w-success")).toBeGreaterThanOrEqual(1);

      const updated = await prisma.videoTask.findUnique({ where: { id: task.id } });
      expect(updated!.status).toBe("completed");
      expect(updated!.duration).toBe(66);
      expect(updated!.completedAt).toBeTruthy();
      // OSS 未配置 → 降级转存：保留原始 URL 并给出持久化警告
      expect(updated!.deliveryStatus).toBe("degraded");
      expect(updated!.deliveryWarning).toContain("持久存储");
    });

    it("marks the task failed on vendor failure", async () => {
      const task = await seedProcessingTask("cj-w-fail");
      chanjingState.videos.set("cj-w-fail", { status: 41, msg: "合成失败" });

      const res = await POST(
        cjReq("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-w-fail", status: 41 },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.videoTask.findUnique({ where: { id: task.id } });
      expect(updated!.status).toBe("failed");
      expect(updated!.errorCode).toBe("41");
      expect(updated!.errorMessage).toBe("合成失败");
    });

    it("deduplicates repeated callbacks for the same id", async () => {
      await seedProcessingTask("cj-w-dedup");
      chanjingState.videos.set("cj-w-dedup", { status: 20 });

      const body = { id: "cj-w-dedup", status: 20 };
      await POST(cjReq("/api/webhook/chanjing", { method: "POST", body }));
      const second = await POST(
        cjReq("/api/webhook/chanjing", { method: "POST", body }),
      );
      expect(second.status).toBe(200);
      expect((await json(second)).ok).toBe(true);
      expect(chanjingState.videoQueries.get("cj-w-dedup")).toBe(1);
    });

    it("readies the avatar, binds its voice, and schedules a demo video", async () => {
      const avatar = await prisma.avatar.create({
        data: {
          userId: user.id,
          name: "CJ Clone",
          status: "cloning",
          provider: "chanjing",
          externalTaskId: "cj-person-ready",
        },
      });
      chanjingState.people.set("cj-person-ready", {
        status: 2,
        pic_url: "https://cdn.example.com/avatar/cover.jpg",
        preview_url: "https://cdn.example.com/avatar/preview.mp4",
        audio_man_id: "sp-cj-clone",
      });

      const res = await POST(
        cjReq("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-person-ready", status: 2 },
        }),
      );
      expect(res.status).toBe(200);

      const updated = await prisma.avatar.findUnique({ where: { id: avatar.id } });
      expect(updated!.status).toBe("ready");
      expect(updated!.externalVirtualmanId).toBe("cj-person-ready");
      expect(updated!.externalSpeakerId).toBe("sp-cj-clone");
      expect(updated!.speakerName).toBe("CJ Clone的声音");
      // 封面走降级转存：保留供应商原始 URL
      expect(updated!.coverUrl).toBe("https://cdn.example.com/avatar/cover.jpg");

      const voiceAsset = await prisma.asset.findFirst({
        where: { userId: user.id, assetType: "voice", externalSpeakerId: "sp-cj-clone" },
      });
      expect(voiceAsset).not.toBeNull();

      // 声音就绪后自动补发演示视频（create_video 真实打到假服务器）
      const deadline = Date.now() + 3000;
      let demoTaskId: string | null = null;
      while (Date.now() < deadline) {
        const fresh = await prisma.avatar.findUnique({ where: { id: avatar.id } });
        demoTaskId = fresh?.demoTaskId ?? null;
        if (demoTaskId) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(demoTaskId).toMatch(/^cj-video-/);
      const demoPayload = chanjingState.createVideoCalls.at(-1) as Record<string, any>;
      expect(demoPayload.person.id).toBe("cj-person-ready");
      expect(demoPayload.audio.tts.audio_man).toBe("sp-cj-clone");
      expect(demoPayload.audio.tts.text).toEqual([AVATAR_DEMO_TEXT]);
    });

    it("returns 404 for orphan ids", async () => {
      const res = await POST(
        cjReq("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-unknown-id", status: 30 },
        }),
      );
      expect(res.status).toBe(404);
      expect((await json(res)).ok).toBe(false);
    });

    it("rejects callbacks without the webhook secret (fail-closed)", async () => {
      const noHeader = await POST(
        req("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-auth-1", status: 30 },
        }),
      );
      expect(noHeader.status).toBe(401);

      const wrongHeader = await POST(
        req("/api/webhook/chanjing", {
          method: "POST",
          body: { id: "cj-auth-1", status: 30 },
          headers: { "x-webhook-secret": "wrong-secret" },
        }),
      );
      expect(wrongHeader.status).toBe(401);
      expect(chanjingState.videoQueries.get("cj-auth-1")).toBeUndefined();
    });
  });
});
