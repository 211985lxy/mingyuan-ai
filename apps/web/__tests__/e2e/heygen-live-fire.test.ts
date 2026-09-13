import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";

// ─── HeyGen 默认链路 live-fire ───────────────────────────────
// 不 mock 供应商客户端：本进程内启动一个假的 HeyGen External API，
// 让真实 HTTP 客户端（src/lib/heygen.ts）走完整网络路径：
// X-Api-Key 鉴权 → POST /v3/videos → 轮询 GET /v3/videos/{id} → 结果映射。
// 断言的核心是**假供应商实际收到的请求体**：脚本驱动带 script+voice_id，
// 音频驱动带 audio_url 且不得同时下发 script。
// 本文件不产生任何外部网络请求。

const HG_PORT = 4791;
const HG_KEY = "e2e-heygen-key";
const HG_AVATAR_ID = "e2e-avatar-1";
const HG_VOICE_ID = "e2e-voice-1";

const { heygenState } = vi.hoisted(() => {
  process.env.HEYGEN_API_KEY = "e2e-heygen-key";
  process.env.HEYGEN_BASE_URL = "http://127.0.0.1:4791";
  process.env.HEYGEN_MAX_CONCURRENT = "10";
  // 服务端按 env 解析供应商（不读 body.provider），故此处显式指定
  process.env.DIGITAL_HUMAN_PROVIDER = "heygen";
  return {
    heygenState: {
      createCalls: [] as Array<Record<string, unknown>>,
      statusCalls: 0,
      quotaCalls: 0,
      /** 令第 N 次状态查询返回指定队列（用于走完 processing → completed） */
      queue: [] as Array<Record<string, unknown>>,
      rejectAuth: false,
    },
  };
});

vi.mock("@/lib/digital-human-voice-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/digital-human-voice-bridge")>();
  return {
    ...actual,
    // 自有语音合成是付费外部服务：这里只返回受管 URL 与 6h 签名 URL，
    // 断言重点仍是假供应商实际收到的 audio_url
    synthesizeOwnVoiceToOss: vi.fn(async () => ({
      ossUrl: "https://oss.example.com/own.mp3",
      signedUrl: "https://oss.example.com/own.mp3?Expires=21600&Signature=e2e",
      contentType: "audio/mpeg",
      model: "s2.1-pro-free",
      charCount: 12,
      bytes: 1024,
    })),
  };
});

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers";
import jwt from "jsonwebtoken";
import { POST as POST_TASKS } from "@/app/api/tasks/route";
import { getVideoTaskStatusForProvider } from "@/lib/digital-human-provider";
import { listAvatars, listVoices, getUserMe, request } from "@/lib/heygen";

let server: http.Server;
let user: { id: string; email: string };
let token: string;
let projectId: string;
let avatarId: string;

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } });
}

function readBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => resolve(data));
  });
}

function nextStatus(id: string): Record<string, unknown> {
  return heygenState.queue.shift() ?? { id, status: "processing" };
}

describe("HeyGen live-fire (real HTTP client + fake vendor)", () => {
  beforeAll(async () => {
    server = http.createServer((reqMsg, res) => {
      void (async () => {
        const url = new URL(reqMsg.url ?? "/", `http://127.0.0.1:${HG_PORT}`);
        const body = reqMsg.method === "POST" ? JSON.parse((await readBody(reqMsg)) || "{}") : {};

        res.setHeader("Content-Type", "application/json");

        if (heygenState.rejectAuth || reqMsg.headers["x-api-key"] !== HG_KEY) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: { code: "unauthorized", message: "invalid api key" } }));
          return;
        }

        if (url.pathname === "/v3/users/me" && reqMsg.method === "GET") {
          heygenState.quotaCalls += 1;
          res.end(JSON.stringify({ data: { username: "e2e", email: "e2e@example.com", first_name: "E", last_name: "2E" } }));
          return;
        }

        if (url.pathname === "/v3/avatars" && reqMsg.method === "GET") {
          res.end(JSON.stringify({
            data: [
              { id: HG_AVATAR_ID, name: "商务主持", created_at: 1, looks_count: 1, consent_status: "approved", default_voice_id: HG_VOICE_ID },
              { id: "e2e-avatar-unconsented", name: "未授权形象", created_at: 1, looks_count: 1, consent_status: "pending" },
            ],
            has_more: false,
          }));
          return;
        }

        if (url.pathname === "/v3/voices" && reqMsg.method === "GET") {
          res.end(JSON.stringify({ data: [{ voice_id: HG_VOICE_ID, name: "普通话女声", language: "zh", gender: "female", type: "public" }] }));
          return;
        }

        if (url.pathname === "/v3/videos" && reqMsg.method === "POST") {
          heygenState.createCalls.push(body);
          const videoId = `hg-video-${heygenState.createCalls.length}`;
          res.end(JSON.stringify({ data: { video_id: videoId, status: "pending", output_format: "mp4" } }));
          return;
        }

        const single = url.pathname.match(/^\/v3\/videos\/([^/]+)$/);
        if (single && reqMsg.method === "GET") {
          heygenState.statusCalls += 1;
          res.end(JSON.stringify({ data: nextStatus(single[1]) }));
          return;
        }
        if (single && reqMsg.method === "DELETE") {
          res.end(JSON.stringify({ data: { id: single[1] } }));
          return;
        }

        if (url.pathname === "/v3/boom") {
          res.statusCode = 500;
          res.end(JSON.stringify({ message: "boom without error object" }));
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: { code: "not_found", message: `unknown route ${url.pathname}` } }));
      })();
    });

    await new Promise<void>((resolve) => server.listen(HG_PORT, "127.0.0.1", resolve));

    await cleanDatabase();
    await cleanRedis();
    const u = await prisma.user.create({
      data: {
        email: "heygen-live@e2e.com",
        password: "hashed",
        name: "HeyGen Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id, email: u.email };
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" });

    const project = await prisma.clientProject.create({ data: { userId: user.id, name: "HeyGen 项目" } });
    projectId = project.id;

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        projectId,
        name: "商务主持",
        status: "ready",
        provider: "heygen",
        externalVirtualmanId: HG_AVATAR_ID,
        externalSpeakerId: HG_VOICE_ID,
      },
    });
    avatarId = avatar.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_BASE_URL;
    delete process.env.HEYGEN_MAX_CONCURRENT;
    delete process.env.DIGITAL_HUMAN_PROVIDER;
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    heygenState.createCalls.length = 0;
    heygenState.statusCalls = 0;
    heygenState.quotaCalls = 0;
    heygenState.queue.length = 0;
    heygenState.rejectAuth = false;
    await cleanRedis();
    await prisma.videoTask.deleteMany();
  });

  // ─── 真实 HTTP 客户端 ──────────────────────────────────

  it("reads account, avatars and voices over real HTTP with X-Api-Key", async () => {
    const me = await getUserMe();
    expect(me.username).toBe("e2e");
    expect(heygenState.quotaCalls).toBe(1);

    const avatars = await listAvatars();
    expect(avatars.map((a) => a.id)).toContain(HG_AVATAR_ID);
    // 授权状态随形象一并返回，供上层过滤未授权形象
    expect(avatars.find((a) => a.id === HG_AVATAR_ID)?.consent_status).toBe("approved");
    expect(avatars.find((a) => a.id === "e2e-avatar-unconsented")?.consent_status).toBe("pending");

    const voices = await listVoices();
    expect(voices[0].voice_id).toBe(HG_VOICE_ID);
  });

  it("rejects a bad api key instead of treating it as success", async () => {
    heygenState.rejectAuth = true;
    await expect(getUserMe()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("surfaces a non-2xx HTTP status when the body carries no error object", async () => {
    // 假服务器对未知路径返回 500 + 无 error 对象的 JSON：必须以状态码作为错误码抛出
    await expect(request("GET", "/v3/boom")).rejects.toMatchObject({ code: "500" });
  });

  // ─── 产品链路：脚本驱动 ─────────────────────────────────

  it("submits a script-driven video through the product pipeline", async () => {
    const res = await POST_TASKS(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId,
          projectId,
          scriptContent: "这是一段 HeyGen 脚本驱动的口播正文。",
          provider: "heygen",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBeLessThan(300);

    expect(heygenState.createCalls).toHaveLength(1);
    const sent = heygenState.createCalls[0] as {
      type: string; avatar_id: string; script?: string; voice_id?: string; audio_url?: string; aspect_ratio?: string;
    };
    expect(sent.type).toBe("avatar");
    expect(sent.avatar_id).toBe(HG_AVATAR_ID);
    expect(sent.script).toContain("HeyGen 脚本驱动");
    expect(sent.voice_id).toBe(HG_VOICE_ID);
    expect(sent.audio_url).toBeUndefined();
  });

  // ─── 产品链路：自有语音（音频驱动）───────────────────────

  it("submits an audio-driven video and never sends script alongside audio_url", async () => {

    const res = await POST_TASKS(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId,
          projectId,
          scriptContent: "自有语音正文。",
          provider: "heygen",
          voiceSource: "own_voice",
          voiceId: "fish-9",
        },
      }),
      undefined as never,
    );
    expect(res.status).toBeLessThan(300);

    expect(heygenState.createCalls).toHaveLength(1);
    const sent = heygenState.createCalls[0] as { audio_url?: string; script?: string; avatar_id?: string };
    expect(sent.avatar_id).toBe(HG_AVATAR_ID);
    expect(sent.audio_url).toContain("Expires=21600");
    // 互斥：音频驱动时不得同时下发 script
    expect(sent.script).toBeUndefined();
  });

  // ─── 状态轮询与映射 ────────────────────────────────────

  it("polls status and maps completed to succeed with url and duration", async () => {
    heygenState.queue.push(
      { id: "hg-1", status: "processing" },
      { id: "hg-1", status: "completed", video_url: "https://files.heygen.ai/out.mp4", thumbnail_url: "https://files.heygen.ai/out.jpg", duration: 9.4 },
    );

    const processing = await getVideoTaskStatusForProvider("heygen", "hg-1");
    expect(processing.status).toBe("processing");

    const done = await getVideoTaskStatusForProvider("heygen", "hg-1");
    expect(done.status).toBe("succeed");
    expect(done.result?.videoUrl).toBe("https://files.heygen.ai/out.mp4");
    expect(done.result?.duration).toBe(9.4);
  });

  it("maps failed to a failure carrying both code and readable message", async () => {
    heygenState.queue.push({ id: "hg-2", status: "failed", failure_code: "avatar_error", failure_message: "形象加载失败" });
    const failed = await getVideoTaskStatusForProvider("heygen", "hg-2");
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("avatar_error");
    expect(failed.errorMessage).toBe("形象加载失败");
  });
});
