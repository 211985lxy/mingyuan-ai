import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";

// ─── Hypit 自建渲染后端 live-fire ─────────────────────────────────
// 不 mock 客户端：本进程内起一个假的 Hypit 渲染服务，让真实的
// `src/lib/hypit*.ts` 走完整 HTTP 路径，覆盖 AIM 侧此前从未被端到端跑过的
// 那一段（产品任务接口 → 模板渲染 → 上传 → 提交 → 轮询 → 三比例分派 → 落库）：
//
//   POST /api/v1/checks           落盘 Author Source，回传文件名
//   POST /api/v1/builds           提交 .svrun（<author source="./上一步文件名"/>）
//   GET  /api/v1/jobs/{id}        提交异步时用来换 buildId
//   GET  /api/v1/builds/{id}      状态事实（work.state / work.outcome）
//   GET  /api/v1/builds/{id}/inspect   产物清单（三比例）
//   GET  /api/v1/outputs/{name}/download   取成片字节
//
// 唯一被替换的外部依赖是 **OSS**（第三方云，测试环境不可达）：产物转存返回确定性
// URL，封面缩略图返回 null（降级值）。除此之外全部真实执行，含任务接口（`POST /api/tasks`）、
// 并发槽位、轮询结算与 `renderOutputs` 落库。
// 本文件不产生任何外部网络请求。

const HP_PORT = 4793;
const HP_TOKEN = "e2e-hypit-token";
/** 一个带 `ftyp` box 的极小 MP4 头：用来证明拿到的是成片字节，不是 JSON 错误体。 */
const FAKE_MP4 = Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex");
const BUILD_ID = "hypit-build-1";
/**
 * 刻意不用 `@test.com`：本文件驱动的是完整产品链路，会为这个账号建 `videoTask` 行，
 * 而 `VideoTask.userId` 是 restrict 外键——一旦落进 `cleanDatabase()` 的清理域，
 * 它删账号时会被外键挡下。本仓既有 live-fire 用例（chanjing / heygen）因此一律用
 * `@e2e.com` 且**不回收账号**；e2e 每次启动都由 `prepareE2eDatabase()` 整库重建，
 * 残留账号不会留到下一轮。
 */
const LIVE_USER_EMAIL = "hypit-live@e2e.com";

type FakeOutput = { name: string; target?: boolean; kind?: string };
type FakeBuildFacts = { work: { state: string; outcome?: string }; outputs: FakeOutput[] };

const { hypitState } = vi.hoisted(() => {
  process.env.HYPIT_RENDERER_URL = "http://127.0.0.1:4793";
  process.env.HYPIT_API_TOKEN = "e2e-hypit-token";
  // 总开关默认关（灰度语义）：这里显式打开，才算真的走到了渲染链路
  process.env.HYPIT_ENABLED = "true";
  // 影子模式打开：顺带断言产物落在隔离前缀，不污染正式分发路径
  process.env.HYPIT_SHADOW_MODE = "true";
  process.env.HYPIT_MAX_CONCURRENT = "10";
  // 服务端按 env 解析供应商（不读 body.provider），故此处显式指定
  process.env.DIGITAL_HUMAN_PROVIDER = "hypit";
  // 给 OSS 一套**假配置**：只为让 `isManagedOssUrl()` 认出我们转存后的 URL，
  // 从而走「已是托管存储」的快径 —— 否则结算会拿着伪造 URL 去发起一次真实下载，
  // 本文件就不再是零外部请求了。客户端本身被下面的 vi.mock 替换，不会真的连 OSS。
  process.env.OSS_REGION = "oss-cn-hangzhou";
  process.env.OSS_BUCKET = "e2e-bucket";
  process.env.OSS_ACCESS_KEY_ID = "e2e-oss-key";
  process.env.OSS_ACCESS_KEY_SECRET = "e2e-oss-secret";
  return {
    hypitState: {
      checksCalls: [] as Array<{ content?: string; filename?: string }>,
      buildCalls: [] as Array<Record<string, unknown>>,
      jobCalls: 0,
      statusCalls: 0,
      inspectCalls: 0,
      downloads: [] as string[],
      /** >0 时，先消耗几次 `/jobs` 才给出 buildId（覆盖 waitForBuildId） */
      jobsBeforeBuildId: 0,
      buildId: "hypit-build-1" as string | null,
      build: { work: { state: "running" }, outputs: [] } as FakeBuildFacts,
      checksOmitsSource: false,
      rejectToken: false,
      /** 提交阶段即被渲染服务拒绝（用于验证不留悬挂任务） */
      submitRejected: false,
    },
  };
});

// OSS 是第三方云，测试环境不可达；只替换这两处外部依赖，保留模块其余导出
// （`signOssUrls` / `isManagedOssUrl` 等仍走真实实现）。
vi.mock("@/lib/oss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oss")>();
  return {
    ...actual,
    uploadBufferToOss: vi.fn(
      async (key: string) => `https://e2e-bucket.oss-cn-hangzhou.aliyuncs.com/${key}`,
    ),
    // 封面缩略图走 OSS 的 `x-oss-process=video/snapshot`，是一次**真实出网 fetch**，
    // 换掉 OSS 客户端也拦不住。返回 null 正是它的文档化降级值（生产上快照失败同样
    // 落 null，交付仍判 durable），这样本文件才真的零外部请求。
    persistVideoThumbnail: vi.fn(async () => null),
  };
});

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers";
import jwt from "jsonwebtoken";
import { POST as POST_TASKS } from "@/app/api/tasks/route";
import { pollStaleVideos } from "@/lib/task-recovery/video-polling";
import { uploadHypitSource } from "@/lib/hypit";

let server: http.Server;
let user: { id: string; email: string };
let token: string;
/** 出网守卫的还原句柄：见 beforeAll 里的说明。 */
let restoreFetchGuard: (() => void) | undefined;

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

function jobBody(buildId: string | null) {
  return {
    jobId: "hypit-job-1",
    state: buildId ? "submitted" : "queued",
    buildId,
    source: "inline.svrun",
    title: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    error: null,
    note: null,
  };
}

function submitBody(body: Record<string, unknown>) {
  return {
    type: "realman_broadcast",
    scriptContent: "Hypit 实弹用例正文。",
    provider: "hypit",
    hypitTemplateName: "generic-card",
    aspectRatio: "9:16",
    ...body,
  };
}

/** 拉一次任务行（`pollStaleVideos` 要的正是 `videoTask` 整行）。 */
async function readTask(id: string) {
  return prisma.videoTask.findUniqueOrThrow({ where: { id } });
}

describe("Hypit live-fire (real HTTP client + fake renderer)", () => {
  beforeAll(async () => {
    server = http.createServer((reqMsg, res) => {
      void (async () => {
        const url = new URL(reqMsg.url ?? "/", `http://127.0.0.1:${HP_PORT}`);
        const body = reqMsg.method === "POST" ? JSON.parse((await readBody(reqMsg)) || "{}") : {};
        res.setHeader("Content-Type", "application/json");

        // 渲染服务的内部共享 token 走 X-API-Token，缺失或错误一律拒绝
        if (hypitState.rejectToken || reqMsg.headers["x-api-token"] !== HP_TOKEN) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "forbidden", code: "UNAUTHORIZED", message: "invalid token" }));
          return;
        }

        if (url.pathname === "/api/v1/checks" && reqMsg.method === "POST") {
          hypitState.checksCalls.push(body as { content?: string; filename?: string });
          // 真实服务把 content 落盘后回传**服务端生成**的文件名，调用方无从预测
          res.end(JSON.stringify({
            ok: true,
            ...(hypitState.checksOmitsSource
              ? {}
              : { source: `tpl-${hypitState.checksCalls.length}.svml`, sourceKind: "author" }),
          }));
          return;
        }

        if (url.pathname === "/api/v1/builds" && reqMsg.method === "POST") {
          hypitState.buildCalls.push(body as Record<string, unknown>);
          if (hypitState.submitRejected) {
            res.end(JSON.stringify({
              ...jobBody(null),
              state: "failed",
              error: { code: "MARKUP_INVALID", message: "源解析失败" },
            }));
            return;
          }
          res.end(JSON.stringify(jobBody(hypitState.buildId)));
          return;
        }

        if (url.pathname.startsWith("/api/v1/jobs/") && reqMsg.method === "GET") {
          hypitState.jobCalls += 1;
          if (hypitState.jobsBeforeBuildId > 0) {
            hypitState.jobsBeforeBuildId -= 1;
          } else {
            hypitState.buildId = BUILD_ID;
          }
          res.end(JSON.stringify(jobBody(hypitState.jobsBeforeBuildId > 0 ? null : hypitState.buildId)));
          return;
        }

        const inspect = url.pathname.match(/^\/api\/v1\/builds\/([^/]+)\/inspect$/);
        if (inspect && reqMsg.method === "GET") {
          hypitState.inspectCalls += 1;
          res.end(JSON.stringify({ build: { id: inspect[1], ...hypitState.build } }));
          return;
        }

        const single = url.pathname.match(/^\/api\/v1\/builds\/([^/]+)$/);
        if (single && reqMsg.method === "GET") {
          hypitState.statusCalls += 1;
          res.end(JSON.stringify({ build: { id: single[1], ...hypitState.build } }));
          return;
        }

        const download = url.pathname.match(/^\/api\/v1\/outputs\/([^/]+)\/download$/);
        if (download && reqMsg.method === "GET") {
          hypitState.downloads.push(decodeURIComponent(download[1]));
          res.setHeader("Content-Type", "application/octet-stream");
          // 逻辑产物名不带扩展名，媒体类型由这个响应头决定（见 hypit-deliverables.ts）
          res.setHeader("x-hypit-media-type", "video/mp4");
          res.end(FAKE_MP4);
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ code: "NOT_FOUND", message: `unknown route ${url.pathname}` }));
      })();
    });

    await new Promise<void>((resolve) => server.listen(HP_PORT, "127.0.0.1", resolve));

    // 把文件头那句「不产生任何外部网络请求」变成**断言**，而不是一句注释。
    // 出网只可能是漏 mock 的第三方调用（本项目已踩过：封面缩略图的
    // `x-oss-process=video/snapshot` 是一次真实 fetch，替换 OSS 客户端拦不住），
    // 那种请求在 CI 上会变成一个不受控的网络依赖。
    const realFetch = globalThis.fetch;
    const guard = vi.spyOn(globalThis, "fetch").mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(url)) {
        throw new Error(`[e2e-hypit] 本文件不应发起外部请求，但拦截到：${url}`);
      }
      return realFetch(input, init);
    }) as typeof globalThis.fetch);
    restoreFetchGuard = () => guard.mockRestore();

    await cleanDatabase();
    await cleanRedis();
    const u = await prisma.user.create({
      data: {
        email: LIVE_USER_EMAIL,
        password: "hashed",
        name: "Hypit Live Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    user = { id: u.id, email: u.email };
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreFetchGuard?.();
    // 恢复套件级环境（global-setup 里默认闪剪），避免影响其余用例
    process.env.DIGITAL_HUMAN_PROVIDER = "shanjian";
    for (const key of [
      "HYPIT_RENDERER_URL",
      "HYPIT_API_TOKEN",
      "HYPIT_ENABLED",
      "HYPIT_SHADOW_MODE",
      "HYPIT_MAX_CONCURRENT",
      // 必须清掉：其余用例依赖「OSS 未配置」的降级行为，泄漏过去会让它们误判
      "OSS_REGION",
      "OSS_BUCKET",
      "OSS_ACCESS_KEY_ID",
      "OSS_ACCESS_KEY_SECRET",
    ]) {
      delete process.env[key];
    }
    await cleanDatabase();
    await disconnectAll();
  });

  beforeEach(async () => {
    hypitState.checksCalls.length = 0;
    hypitState.buildCalls.length = 0;
    hypitState.jobCalls = 0;
    hypitState.statusCalls = 0;
    hypitState.inspectCalls = 0;
    hypitState.downloads.length = 0;
    hypitState.jobsBeforeBuildId = 0;
    hypitState.buildId = BUILD_ID;
    hypitState.build = { work: { state: "running" }, outputs: [] };
    hypitState.checksOmitsSource = false;
    hypitState.rejectToken = false;
    hypitState.submitRejected = false;
    await cleanRedis();
    await prisma.videoTask.deleteMany({ where: { userId: user.id } });
  });

  // ─── 渲染服务客户端（真实 HTTP）────────────────────────

  it("uploads the rendered Author Source and reports the service-side filename", async () => {
    const source = await uploadHypitSource({
      content: "<?svml using=\"@hypit/markup@1\"?>\n<svml/>",
      filename: "generic-card.svml",
    });
    expect(source).toBe("tpl-1.svml");
    expect(hypitState.checksCalls[0].filename).toBe("generic-card.svml");
  });

  it("fails closed when the service validates but returns no filename", async () => {
    hypitState.checksOmitsSource = true;
    // 没有文件名就没法在下一步的 .svrun 里引用它，必须当场失败而不是继续往下走
    await expect(uploadHypitSource({ content: "<svml/>", filename: "x.svml" }))
      .rejects.toMatchObject({ code: "HYPIT_BAD_RESPONSE" });
  });

  it("surfaces the renderer error code instead of treating 4xx as success", async () => {
    hypitState.rejectToken = true;
    await expect(uploadHypitSource({ content: "<svml/>", filename: "x.svml" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  // ─── 产品链路：模板 → 提交 → 落库 ───────────────────────

  it("renders the template, uploads it, then submits a Run Source referencing it", async () => {
    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    expect(res.status).toBeLessThan(300);

    // 第一步：Author Source 已渲染（相对路径 + 无残留占位符）
    const author = hypitState.checksCalls[0].content ?? "";
    expect(author).toContain('<?svml using="@hypit/markup@1"?>');
    expect(author).toContain('source="./templates/generic-card/recipes.svs"');
    expect(author).toContain('src="./templates/generic-card/assets/card.jpg"');
    expect(author).not.toContain("{{");

    // 第二步：Run Source 引用上一步返回的文件名，并声明三个比例的 target
    const run = String(hypitState.buildCalls[0].content ?? "");
    expect(run).toContain('<?svml using="@hypit/run-markup@1"?>');
    expect(run).toContain('<author source="./tpl-1.svml"/>');
    for (const target of ["final-916.video", "final-169.video", "final-11.video"]) {
      expect(run).toContain(`<target output="${target}"/>`);
    }

    // buildId 落库为 externalTaskId：轮询靠它推进
    const task = await prisma.videoTask.findFirstOrThrow({ where: { userId: user.id } });
    expect(task.provider).toBe("hypit");
    expect(task.externalTaskId).toBe(BUILD_ID);
    expect(task.status).toBe("processing");
  });

  it("waits for the buildId when submission returns before the build exists", async () => {
    hypitState.buildId = null;
    hypitState.jobsBeforeBuildId = 1;

    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    expect(res.status).toBeLessThan(300);

    expect(hypitState.jobCalls).toBeGreaterThanOrEqual(2);
    const task = await prisma.videoTask.findFirstOrThrow({ where: { userId: user.id } });
    expect(task.externalTaskId).toBe(BUILD_ID);
  });

  // ─── 产品链路：轮询 → 三比例 → 结算 ─────────────────────

  it("polls the build, exports every ratio, and keeps the preferred one as videoUrl", async () => {
    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    expect(res.status).toBeLessThan(300);
    const created = await prisma.videoTask.findFirstOrThrow({ where: { userId: user.id } });

    // 渲染顺序刻意让 16:9 排第一：主 URL 仍须按 payload 里的 9:16 挑出来
    hypitState.build = {
      work: { state: "done", outcome: "complete" },
      outputs: [
        { name: "final-169.video", target: true, kind: "video" },
        { name: "final-916.video", target: true, kind: "video" },
        { name: "final-11.video", target: true, kind: "video" },
      ],
    };

    const polled = await pollStaleVideos([await readTask(created.id)], "[e2e-hypit]");
    expect(polled).toBe(1);

    expect(hypitState.inspectCalls).toBe(1);
    expect(hypitState.downloads).toEqual(["final-169.video", "final-916.video", "final-11.video"]);

    const settled = await readTask(created.id);
    expect(settled.status).toBe("completed");
    expect(settled.errorCode).toBeNull();
    expect(settled.videoUrl).toContain("final-916.video.mp4");
    // 影子模式：产物落隔离前缀，不污染正式路径
    expect(settled.videoUrl).toContain("/hypit-shadow/hypit-build-1/");

    const outputs = settled.renderOutputs as Array<{ outputName: string; aspectRatio: string | null; url: string }>;
    expect(outputs).toHaveLength(3);
    expect(outputs[0].outputName).toBe("final-916.video");
    expect(outputs.map((item) => item.aspectRatio).sort()).toEqual(["16:9", "1:1", "9:16"]);
    expect(outputs.every((item) => item.url.startsWith("https://e2e-bucket.oss-cn-hangzhou.aliyuncs.com/"))).toBe(true);
  });

  it("keeps polling while the build is still running", async () => {
    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    expect(res.status).toBeLessThan(300);
    const created = await prisma.videoTask.findFirstOrThrow({ where: { userId: user.id } });

    await pollStaleVideos([await readTask(created.id)], "[e2e-hypit]");

    const stillRunning = await readTask(created.id);
    expect(stillRunning.status).toBe("processing");
    expect(stillRunning.renderOutputs).toBeNull();
    expect(hypitState.inspectCalls).toBe(0);
  });

  it("fails the task when the build finished without a complete outcome", async () => {
    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    expect(res.status).toBeLessThan(300);
    const created = await prisma.videoTask.findFirstOrThrow({ where: { userId: user.id } });

    hypitState.build = { work: { state: "done", outcome: "failed" }, outputs: [] };
    await pollStaleVideos([await readTask(created.id)], "[e2e-hypit]");

    const failed = await readTask(created.id);
    expect(failed.status).toBe("failed");
    expect(failed.errorCode).toBe("HYPIT_RENDER_FAILED");
    // 未完成不得导出产物
    expect(hypitState.downloads).toHaveLength(0);
  });

  // ─── fail-closed 校验 ──────────────────────────────────

  it("rejects a request that names both a template and an inline source", async () => {
    const res = await POST_TASKS(
      userReq("/api/tasks", {
        method: "POST",
        body: submitBody({ hypitSource: "<svml/>", hypitSourceFilename: "inline.svml" }),
      }),
      undefined as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await json(res)).code).toBe("AMBIGUOUS_HYPIT_SOURCE");
    expect(hypitState.checksCalls).toHaveLength(0);
    expect(hypitState.buildCalls).toHaveLength(0);
  });

  it("rejects an unknown template name before touching the renderer", async () => {
    const res = await POST_TASKS(
      userReq("/api/tasks", { method: "POST", body: submitBody({ hypitTemplateName: "no-such-template" }) }),
      undefined as never,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await json(res)).code).toBe("HYPIT_UNKNOWN_TEMPLATE");
    expect(hypitState.checksCalls).toHaveLength(0);
  });

  it("reports a renderer rejection to the caller instead of leaving a pending task", async () => {
    hypitState.submitRejected = true;

    const res = await POST_TASKS(userReq("/api/tasks", { method: "POST", body: submitBody({}) }), undefined as never);
    // 提交阶段就失败 → 不留下悬挂任务（额度由既有补偿链路回滚）
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.videoTask.count({ where: { userId: user.id, status: "processing" } })).toBe(0);
  });
});
