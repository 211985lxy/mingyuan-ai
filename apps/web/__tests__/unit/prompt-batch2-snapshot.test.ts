import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { NextRequest } from "next/server"
import { dirname, resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 批2（API 路由内联型 prompt 资产化）迁移前行为快照。
 *
 * 覆盖三个内联 prompt 的路由：
 * - /api/brief/ai-fill（Brief 表单智能填写，system + 双分支 user）
 * - /api/admin/knowledge/distill（知识库蒸馏，system + user）
 * - /api/competitor/search-channels/analyze（视频号选题热度分析，system + user）
 *
 * 与批1 相同的两段式：迁移前 commit 上生成基线 JSON，迁移后比对模式
 * 逐案例断言 LLM 收到的 messages **逐字节一致**。基线之后跟随 seed/DB
 * 版本演进，不回写快照。
 */

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  findTemplate: vi.fn(),
  findEntries: vi.fn(),
  searchChannels: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: unknown) => handler,
}))

vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: unknown) => handler,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentTemplate: { findUnique: (...args: unknown[]) => mocks.findTemplate(...(args as [])) },
    knowledgeEntry: { findMany: (...args: unknown[]) => mocks.findEntries(...(args as [])) },
  },
}))

vi.mock("@/lib/llm/client", () => ({
  LLMClient: {
    shared: () => ({ available: true, complete: mocks.complete }),
    reset: vi.fn(),
  },
}))

vi.mock("@/lib/llm", () => ({
  LLMClient: {
    shared: () => ({ available: true, complete: mocks.complete }),
    reset: vi.fn(),
  },
}))

vi.mock("@/lib/tikhub/search-wechat-channels-videos", () => ({
  searchWechatChannelsVideos: (...args: unknown[]) => mocks.searchChannels(...(args as [])),
}))

const { POST: aiFillPOST } = await import("@/app/api/brief/ai-fill/route")
const { POST: distillPOST } = await import("@/app/api/admin/knowledge/distill/route")
const { POST: analyzePOST } = await import("@/app/api/competitor/search-channels/analyze/route")

const SNAPSHOT_PATH = resolve(__dirname, "__fixtures__/prompt-batch2-snapshot.json")

const observed: Record<string, string> = {}

function observe(name: string, value: unknown) {
  observed[name] = typeof value === "string" ? value : JSON.stringify(value)
}

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function observeLastCompletion(prefix: string) {
  const call = mocks.complete.mock.calls.at(-1)?.[0] as {
    messages: Array<{ role: string; content: string }>
  }
  observe(`${prefix}.system`, call.messages[0]?.content)
  observe(`${prefix}.user`, call.messages[1]?.content)
}

// ── brief/ai-fill ─────────────────────────────────────────────────────────

const TEMPLATE_VARIABLES = [
  { key: "topic", label: "选题", required: true, placeholder: "例如：供暖改造避坑", options: ["避坑", "测评"] },
  { key: "audience", label: "目标人群", required: false, placeholder: "例如：新房业主", options: null },
]

async function snapAiFill() {
  mocks.findTemplate.mockResolvedValue({
    id: "tpl-1",
    displayName: "痛点拆解模板",
    description: "从用户痛点切入的口播结构",
    expressionBlueprint: { argumentPattern: "痛点-方案-证据", proofBurden: "至少一个真实案例", ctaStyle: "引导私信" },
    variables: TEMPLATE_VARIABLES,
  })
  mocks.complete.mockReset().mockResolvedValue({ content: '{"topic":"x"}' })
  await aiFillPOST(jsonRequest("http://localhost/api/brief/ai-fill", {
    templateId: "tpl-1",
    userInput: "想讲北方新房供暖改造的坑",
  }), { params: Promise.resolve({}) })
  observeLastCompletion("briefAiFill.full")

  mocks.findTemplate.mockResolvedValue({
    id: "tpl-2",
    displayName: "极简模板",
    description: null,
    expressionBlueprint: null,
    variables: TEMPLATE_VARIABLES.slice(0, 1),
  })
  mocks.complete.mockReset().mockResolvedValue({ content: '{"topic":"x"}' })
  await aiFillPOST(jsonRequest("http://localhost/api/brief/ai-fill", {
    templateId: "tpl-2",
    userInput: "",
  }), { params: Promise.resolve({}) })
  observeLastCompletion("briefAiFill.minimal")
}

// ── admin/knowledge/distill ───────────────────────────────────────────────

async function snapDistill() {
  mocks.findEntries.mockResolvedValue([
    { id: "e1", title: "钩子写法", category: "内容", tags: ["钩子"], content: "开头三秒给冲突。" },
    { id: "e2", title: "钩子写法2", category: "内容", tags: [], content: "开头必须有钩子。" },
  ])
  mocks.complete.mockReset().mockResolvedValue({ content: '{"distilled":[]}' })
  await distillPOST(jsonRequest("http://localhost/api/admin/knowledge/distill", {
    ids: ["e1", "e2"],
  }), { params: Promise.resolve({}) })
  observeLastCompletion("knowledgeDistill.default")
}

// ── competitor/search-channels/analyze ────────────────────────────────────

async function snapChannelsAnalyze() {
  mocks.searchChannels.mockResolvedValue({
    list: [
      { title: "v1", description: "供暖改造第一条", nickname: "老王", play_count: 1000, like_count: 100, comment_count: 10, share_count: 5, duration: 60 },
      { title: "v2", description: "", nickname: "老李", play_count: 2000, like_count: 200, comment_count: 20, share_count: 8, duration: 45 },
    ],
  })
  mocks.complete.mockReset().mockResolvedValue({ content: '{"heat_score":80}' })
  await analyzePOST(
    jsonRequest("http://localhost/api/competitor/search-channels/analyze", { keyword: "供暖改造", count: 5 }),
    { params: Promise.resolve({}) },
  )
  observeLastCompletion("competitorChannels.default")
}

describe("批2 prompt 迁移前行为快照", () => {
  beforeEach(() => {
    mocks.complete.mockReset()
  })

  it("捕获三个路由全部 prompt 输出并与基线逐字节比对", async () => {
    await snapAiFill()
    await snapDistill()
    await snapChannelsAnalyze()

    expect(Object.keys(observed).length).toBe(8)

    if (process.env.UPDATE_PROMPT_BATCH2_SNAPSHOT) {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(observed, null, 2) + "\n", "utf8")
      return
    }

    const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>
    for (const [name, value] of Object.entries(baseline)) {
      expect(observed[name], `快照案例 ${name} 缺失`).toBeDefined()
      expect(value, `快照案例 ${name} 与迁移前基线不一致`).toBe(observed[name])
    }
    expect(Object.keys(observed).sort()).toEqual(Object.keys(baseline).sort())
  })
})
