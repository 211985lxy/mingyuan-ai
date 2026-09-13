import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import jwt from "jsonwebtoken";

// ─── 自有语音 → 数字人 own_voice 链路 live-fire ─────────────────
// 不 mock 桥接层与蝉镜客户端：本进程内启动假蝉镜 Open API，
// 真实链路为 UI 载荷 → service → voice-bridge（Fish 合成+OSS 签名）→
// provider → 真实 HTTP 客户端 → 假蝉镜 create_video。
//
// Fish Audio 与 OSS 是付费外部服务，必须替换：Fish 只在 mock 里产字节，
// OSS 只在 mock 里返回受管 URL 与签名 URL。断言的核心是
// **假蝉镜收到的 create_video 请求体里 audio.type === "audio"**。

vi.mock("@/lib/voice/fish-audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voice/fish-audio")>();
  return {
    ...actual,
    isFishAudioConfigured: () => true,
    synthesizeSpeech: vi.fn(async (input: { text: string; voiceId?: string | null }) => ({
      audio: new Uint8Array(2048).buffer,
      contentType: "audio/mpeg",
      model: "s2.1-pro-free",
      voiceId: input.voiceId ?? null,
      charCount: input.text.length,
    })),
  };
});

const OSS_URL = "https://mingdong-e2e.oss-cn-beijing.aliyuncs.com";
const SIGNED_AUDIO_URL = `${OSS_URL}/digital-human-voice/e2e/voice.mp3?Expires=9999999999&Signature=e2e`;

vi.mock("@/lib/oss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oss")>();
  return {
    ...actual,
    isOssConfigured: () => true,
    uploadBufferToOss: vi.fn(async (key: string) => `${OSS_URL}/${key}`),
    // 桥接层必须显式传入抓取 TTL；这里把它带进签名 URL 以便断言
    generateSignedUrl: vi.fn((url: string, expires?: number) =>
      url.startsWith(OSS_URL) ? `${url}?Expires=${expires ?? "default"}&Signature=e2e` : url,
    ),
  };
});

const { chanjingState } = vi.hoisted(() => {
  process.env.CHANJING_APP_ID = "e2e-ownvoice-app";
  process.env.CHANJING_SECRET_KEY = "e2e-ownvoice-secret";
  process.env.CHANJING_BASE_URL = "http://127.0.0.1:4790";
  process.env.CHANJING_AUTH_TEXT = "E2E蝉镜授权文案";
  process.env.DIGITAL_HUMAN_PROVIDER = "chanjing";
  return {
    chanjingState: {
      tokenCalls: 0,
      videoSeq: 0,
      createVideoCalls: [] as Array<Record<string, unknown>>,
    },
  };
});

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers";
import { POST } from "@/app/api/tasks/route";
import { POST as RETRY } from "@/app/api/tasks/[id]/retry/route";
import { CHANJING_GRAB_URL_TTL_SECONDS } from "@/lib/digital-human-voice-bridge";
import { releaseProviderSlot } from "@/lib/digital-human-semaphore";

const CJ_PORT = 4790;

let server: http.Server;
let user: { id: string; email: string };
let token: string;
let projectId: string;
let avatarId: string;

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } });
}

function jsonBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => resolve(data));
  });
}

describe("Own-voice digital human live-fire (real pipeline + fake vendor)", () => {
  beforeAll(async () => {
    server = http.createServer((reqMsg, res) => {
      void (async () => {
        const url = new URL(reqMsg.url ?? "/", `http://127.0.0.1:${CJ_PORT}`);
        const body = reqMsg.method === "POST" ? JSON.parse((await jsonBody(reqMsg)) || "{}") : {};

        if (url.pathname === "/open/v1/access_token") {
          chanjingState.tokenCalls += 1;
          res.end(JSON.stringify({
            code: 0,
            data: { access_token: `tok-${chanjingState.tokenCalls}`, expire_in: 3600 },
            trace_id: "t-0",
          }));
          return;
        }

        if (url.pathname === "/open/v1/create_video" && reqMsg.method === "POST") {
          chanjingState.createVideoCalls.push(body);
          chanjingState.videoSeq += 1;
          const id = `cj-ownvoice-${chanjingState.videoSeq}`;
          res.end(JSON.stringify({ code: 0, data: id, trace_id: "t-1" }));
          return;
        }

        if (url.pathname === "/open/v1/video" && reqMsg.method === "GET") {
          const id = url.searchParams.get("id") ?? "";
          res.end(JSON.stringify({
            code: 0,
            data: { id, queue_status: "processing", status: 20 },
            trace_id: "t-2",
          }));
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
        email: "ownvoice-live@e2e.com",
        password: "hashed",
        name: "Own Voice Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id, email: u.email };
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" });

    const project = await prisma.clientProject.create({
      data: { userId: user.id, name: "自有语音项目" },
    });
    projectId = project.id;

    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        projectId,
        name: "海城-商务",
        status: "ready",
        provider: "chanjing",
        externalVirtualmanId: "dp-ownvoice-1",
        externalSpeakerId: "sp-ownvoice-1",
      },
    });
    avatarId = avatar.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.CHANJING_APP_ID;
    delete process.env.CHANJING_SECRET_KEY;
    delete process.env.CHANJING_BASE_URL;
    delete process.env.CHANJING_AUTH_TEXT;
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    chanjingState.createVideoCalls.length = 0;
    await cleanRedis();
    await prisma.videoTask.deleteMany();
  });

  it("submits an audio-type create_video request driven by our own voice", async () => {
    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId,
          projectId,
          scriptContent: "这是一段用我自己的声音录制的口播正文。",
          voiceSource: "own_voice",
          voiceId: "fish-voice-42",
        },
      }),
      undefined as never,
    );

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.data.externalTaskId).toBe("cj-ownvoice-1");

    // ─── 关键断言：假蝉镜收到的就是 audio 型请求 ───
    expect(chanjingState.createVideoCalls).toHaveLength(1);
    const sent = chanjingState.createVideoCalls[0] as {
      person: { id: string; figure_type: string };
      audio: { type: string; wav_url: string };
      screen_width: number;
      screen_height: number;
    };

    expect(sent.audio.type).toBe("audio");
    expect(sent.audio.wav_url.startsWith(`${OSS_URL}/digital-human-voice/${user.id}/`)).toBe(true);
    // 签名 URL 必须带抓取 TTL（6h），而不是 OSS 默认的 2h
    expect(sent.audio.wav_url).toContain(`Expires=${CHANJING_GRAB_URL_TTL_SECONDS}`);
    expect(sent.person.id).toBe("dp-ownvoice-1");
    expect(sent.screen_width).toBe(1080);
    expect(sent.screen_height).toBe(1920);
    // audio 型不携带蝉镜音色与文案
    expect(sent.audio).not.toHaveProperty("tts");

    // ─── 任务记录保留重试快照 ───
    const task = await prisma.videoTask.findFirst({ where: { userId: user.id } });
    const snapshot = task?.shanjianPayload as Record<string, unknown>;
    expect(snapshot.audioType).toBe("audio");
    expect(snapshot.ownVoiceVoiceId).toBe("fish-voice-42");
  });

  it("exposes the own-voice snapshot so a retry re-synthesizes our voice, not the provider voice", async () => {
    const created = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId,
          projectId,
          scriptContent: "重试保真验证文案。",
          voiceSource: "own_voice",
          voiceId: "fish-voice-42",
        },
      }),
      undefined as never,
    );
    const taskId = (await json(created)).data.id as string;

    // 置为失败以便重试；首个任务占用的并发槽需释放（生产由 webhook/校准回收）
    await prisma.videoTask.update({ where: { id: taskId }, data: { status: "failed" } });
    await releaseProviderSlot("chanjing");
    chanjingState.createVideoCalls.length = 0;

    const retried = await RETRY(userReq(`/api/tasks/${taskId}/retry`, { method: "POST" }), {
      params: Promise.resolve({ id: taskId }),
    } as never);

    expect(retried.status).toBeLessThan(300);

    // 重试仍须是 audio 型：若退化为 tts，这里会看到 audio.type === "tts"
    expect(chanjingState.createVideoCalls).toHaveLength(1);
    const sent = chanjingState.createVideoCalls[0] as { audio: { type: string; wav_url: string } };
    expect(sent.audio.type).toBe("audio");
    expect(sent.audio.wav_url).toContain(`Expires=${CHANJING_GRAB_URL_TTL_SECONDS}`);
    // 必须是本次新签名的 URL，而不是存下来的过期链接
    expect(sent.audio.wav_url).not.toContain("expired");
  });

  it("keeps the provider-tts flow on its own audio type", async () => {
    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId,
          projectId,
          scriptContent: "自带音色对照文案。",
        },
      }),
      undefined as never,
    );

    expect(res.status).toBe(201);
    const sent = chanjingState.createVideoCalls[0] as {
      audio: { type: string; tts?: { text: string[] } };
    };
    expect(sent.audio.type).toBe("tts");
    expect(sent.audio.tts?.text[0]).toContain("自带音色对照文案");
  });
});
