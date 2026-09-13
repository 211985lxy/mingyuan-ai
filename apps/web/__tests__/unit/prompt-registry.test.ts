/**
 * Prompt Registry 单测（不连真实 DB：@/lib/prisma 用替身）。
 *
 * 覆盖：
 * - 选版优先级：显式 version > active > qualified > draft > 内置 seed
 * - DB 失败回落 seed 且不抛错，warn 每 key 只打一次
 * - seed 幂等（重复 registerSeed / 重复 get 行为稳定）
 * - getMessages 返回 [{role:"system"},{role:"user"}]
 * - 全部 key 的内置 seed 非空、唯一且可回落
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_SEEDS } from "@/lib/prompt/seeds"
import { checkPromptPromotion, PROMPT_KEYS, type PromptStatus } from "@/lib/prompt/types"

const { state, findMany } = vi.hoisted(() => ({
  state: { importThrows: false },
  findMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    if (state.importThrows) throw new Error("prisma 不可用（测试替身）")
    return { promptVersion: { findMany } }
  },
}))

const KEY = "test.prompt.selection"

interface FakeRow {
  templateKey: string
  version: number
  content: string
  type: string
  status: PromptStatus
}

function rows(list: Array<{ version: number; status: PromptStatus; content?: string }>): FakeRow[] {
  return list.map((v) => ({
    templateKey: KEY,
    version: v.version,
    content: v.content ?? `content-v${v.version}-${v.status}`,
    type: "system",
    status: v.status,
  }))
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  promptRegistry.__resetForTest()
  state.importThrows = false
  findMany.mockReset()
  findMany.mockResolvedValue([])
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe("prompt-registry 选版优先级", () => {
  it("active > qualified > draft", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED" })
    findMany.mockResolvedValue(
      rows([
        { version: 1, status: "draft" },
        { version: 2, status: "qualified" },
        { version: 3, status: "draft" },
        { version: 4, status: "active" },
      ]),
    )
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY).content).toBe("content-v4-active")
    expect(promptRegistry.get(KEY).fromSeed).toBe(false)
  })

  it("无 active 时取 qualified，其次 draft（同状态取最大版本）", async () => {
    findMany.mockResolvedValue(
      rows([
        { version: 5, status: "draft" },
        { version: 2, status: "qualified" },
        { version: 3, status: "draft" },
      ]),
    )
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY).content).toBe("content-v2-qualified")

    findMany.mockResolvedValue(rows([{ version: 5, status: "draft" }, { version: 9, status: "draft" }]))
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY).content).toBe("content-v9-draft")
  })

  it("显式 version 优先级最高，可越过 active", async () => {
    findMany.mockResolvedValue(
      rows([
        { version: 1, status: "draft" },
        { version: 2, status: "active" },
      ]),
    )
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY, { version: 1 }).content).toBe("content-v1-draft")
    expect(promptRegistry.get(KEY).content).toBe("content-v2-active")
  })

  it("显式 version 不存在时回落 seed", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED-FALLBACK" })
    findMany.mockResolvedValue(rows([{ version: 1, status: "active" }]))
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY, { version: 99 }).content).toBe("SEED-FALLBACK")
  })

  it("opts.status 可限定状态集合", async () => {
    findMany.mockResolvedValue(
      rows([
        { version: 1, status: "draft" },
        { version: 2, status: "qualified" },
        { version: 3, status: "active" },
      ]),
    )
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY, { status: "draft" }).content).toBe("content-v1-draft")
    expect(promptRegistry.get(KEY, { status: ["draft", "qualified"] }).content).toBe("content-v2-qualified")
  })

  it("DB 无版本时回落内置 seed", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED-ONLY" })
    findMany.mockResolvedValue([])
    await promptRegistry.refresh(KEY)
    const record = promptRegistry.get(KEY)
    expect(record.content).toBe("SEED-ONLY")
    expect(record.fromSeed).toBe(true)
    expect(record.status).toBe("draft")
  })
})

describe("prompt-registry DB 失败回落", () => {
  it("回源抛错不向上抛，保留 seed，且 warn 每 key 只打一次", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED-KEEP" })
    findMany.mockRejectedValue(new Error("DB down"))

    await expect(promptRegistry.refresh(KEY)).resolves.toBeUndefined()
    expect(promptRegistry.get(KEY).content).toBe("SEED-KEEP")
    expect(promptRegistry.get(KEY).fromSeed).toBe(true)

    // 再次回源仍失败：warn 不再重复
    await expect(promptRegistry.refresh(KEY)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("prompt-registry")
    expect(promptRegistry.get(KEY).content).toBe("SEED-KEEP")
  })

  it("prisma 模块本身 import 失败也不抛错", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED-NO-IMPORT" })
    state.importThrows = true
    await expect(promptRegistry.refresh(KEY)).resolves.toBeUndefined()
    expect(promptRegistry.get(KEY).content).toBe("SEED-NO-IMPORT")
  })

  it("未注册 seed 的未知 key 返回空串而非抛错", async () => {
    findMany.mockRejectedValue(new Error("DB down"))
    await promptRegistry.refresh("unknown.key")
    expect(promptRegistry.get("unknown.key")).toEqual({
      key: "unknown.key",
      version: 0,
      content: "",
      type: "system",
      status: "draft",
      fromSeed: true,
    })
  })
})

describe("prompt-registry seed 与缓存", () => {
  it("registerSeed 幂等：同 key 后注册覆盖，重复 get 结果稳定", () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "A" })
    expect(promptRegistry.get(KEY).content).toBe("A")
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "B" })
    expect(promptRegistry.get(KEY).content).toBe("B")
    expect(promptRegistry.get(KEY).content).toBe("B")
  })

  it("getMessages 返回 [system, user] 结构", () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SYS" })
    expect(promptRegistry.getMessages(KEY, "USER")).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ])
  })

  it("hydrate 批量预热不抛错", async () => {
    findMany.mockResolvedValue([])
    await expect(promptRegistry.hydrate([PROMPT_KEYS.commentRadar])).resolves.toBeUndefined()
    expect(findMany).toHaveBeenCalled()
  })

  it("__resetForTest 清空缓存后可重新回源", async () => {
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED" })
    findMany.mockResolvedValue(rows([{ version: 7, status: "active" }]))
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY).content).toBe("content-v7-active")

    promptRegistry.__resetForTest()
    promptRegistry.registerSeed({ key: KEY, domain: "test", version: 1, type: "system", content: "SEED" })
    findMany.mockResolvedValue([])
    await promptRegistry.refresh(KEY)
    expect(promptRegistry.get(KEY).content).toBe("SEED")
  })
})

describe("prompt-registry 内置 seed（批0~批5 主创作链）", () => {
  it("全部 key 注册且内容非空、key 唯一", () => {
    expect(PROMPT_SEEDS).toHaveLength(69)
    const seedKeys = PROMPT_SEEDS.map((seed) => seed.key)
    expect(new Set(seedKeys).size).toBe(seedKeys.length)
    for (const key of Object.values(PROMPT_KEYS)) {
      const record = promptRegistry.get(key)
      expect(record.content.length, `${key} 应有内置 seed`).toBeGreaterThan(0)
      expect(record.fromSeed).toBe(true)
      expect(record.version).toBe(1)
    }
  })

  it("seed 内容与迁移前逐字一致（关键片段抽样）", () => {
    expect(promptRegistry.get(PROMPT_KEYS.knowledgeEntityExtract).content).toContain("你是知识图谱抽取器")
    expect(promptRegistry.get(PROMPT_KEYS.marketingShortvideo).content).toContain("短视频营销分析师")
    expect(promptRegistry.get(PROMPT_KEYS.commentRadar).content).toContain("短视频评论洞察分析师")
    expect(promptRegistry.get(PROMPT_KEYS.transcriptPolish).content).toContain(
      "你是中文语音/视频转写文本校对润色助手。",
    )
    expect(promptRegistry.get(PROMPT_KEYS.competitorAnalysis).content).toContain("短视频账号分析师")
    expect(promptRegistry.get(PROMPT_KEYS.meetingInsight).content).toContain("你是客户会后洞察抽取器")
  })

  it("数组形态 seed 已 join 为单行分隔字符串", () => {
    const polish = promptRegistry.get(PROMPT_KEYS.transcriptPolish).content
    expect(polish.split("\n")).toHaveLength(6)
    expect(polish.endsWith("直接输出修正后的纯文本。")).toBe(true)
  })
})

// ── P1：fixtureKey 升级门禁 + promptMeta 可观测 ──────────────────────────

describe("P1 prompt 升级门禁与可观测", () => {
  it("draft → qualified 无 fixtureKey 拒绝，有 fixtureKey 放行", () => {
    expect(checkPromptPromotion({ fromStatus: "draft", toStatus: "qualified" }).allowed).toBe(false)
    expect(
      checkPromptPromotion({ fromStatus: "draft", toStatus: "qualified", fixtureKey: "  " }).allowed,
    ).toBe(false)
    const ok = checkPromptPromotion({ fromStatus: "draft", toStatus: "qualified", fixtureKey: "eval.prompt.v2" })
    expect(ok.allowed).toBe(true)
  })

  it("只有 qualified 可升 active；draft 直升 active 拒绝", () => {
    expect(checkPromptPromotion({ fromStatus: "qualified", toStatus: "active" }).allowed).toBe(true)
    const rejected = checkPromptPromotion({ fromStatus: "draft", toStatus: "active" })
    expect(rejected.allowed).toBe(false)
    expect(rejected.reason).toContain("qualified")
  })

  it("回落 draft 恒放行（回滚语义）；同状态拒绝", () => {
    expect(checkPromptPromotion({ fromStatus: "active", toStatus: "draft" }).allowed).toBe(true)
    expect(checkPromptPromotion({ fromStatus: "qualified", toStatus: "draft" }).allowed).toBe(true)
    expect(checkPromptPromotion({ fromStatus: "draft", toStatus: "draft" }).allowed).toBe(false)
  })

  it("resolveForCompletion 返回 [system,user] 与 key+version 元数据", () => {
    promptRegistry.__resetForTest()
    const { messages, promptMeta } = promptRegistry.resolveForCompletion(
      PROMPT_KEYS.commentRadar,
      "评论样本……",
    )
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe("system")
    expect(messages[0].content.length).toBeGreaterThan(0)
    expect(messages[1]).toEqual({ role: "user", content: "评论样本……" })
    expect(promptMeta.key).toBe(PROMPT_KEYS.commentRadar)
    expect(promptMeta.version).toBe(1)
  })

  it("调用点把 promptMeta 传入 complete（可观测断言）", async () => {
    promptRegistry.__resetForTest()
    const complete = vi.fn(async (options: {
      promptMeta?: { key: string; version: number }
      messages: unknown[]
    }) => ({
      content: JSON.stringify({ summary: "测试摘要", topics: [], suggestedTopics: [] }),
      model: "m",
      provider: "p",
      echoedMeta: options.promptMeta,
    }))
    vi.doMock("@/lib/llm/client", () => ({
      LLMClient: { shared: () => ({ complete }), reset: vi.fn() },
    }))
    vi.doMock("@/lib/llm", () => ({
      LLMClient: { shared: () => ({ complete }), reset: vi.fn() },
    }))
    const { analyzeComments } = await import("@/lib/comment-radar/analyzer")
    await analyzeComments(
      [{ id: "c1", text: "内容", nickname: "a", likes: 1, isTop: false }],
      1,
      "douyin",
    )
    const options = complete.mock.calls[0][0] as {
      promptMeta?: { key: string; version: number }
      messages: unknown[]
    }
    expect(options.promptMeta).toBeDefined()
    expect(options.promptMeta?.key).toBe(PROMPT_KEYS.commentRadar)
    expect(options.promptMeta?.version).toBe(1)
    expect(options.messages).toHaveLength(2)
    vi.doUnmock("@/lib/llm/client")
  })
})

// ── P1 热更：TTL 到期后台回源 + reload 手动开关 ──────────────────────────

describe("P1 缓存热更", () => {
  it("reload 清缓存后全量回源，DB 新版本立即生效", async () => {
    promptRegistry.__resetForTest()
    findMany.mockResolvedValue([
      { templateKey: PROMPT_KEYS.commentRadar, version: 2, content: "DB v2 内容", type: "system", status: "active" },
    ])
    console.log("probe: before reload, seeds loaded")
    findMany.mockResolvedValue([])
    await promptRegistry.hydrate([PROMPT_KEYS.commentRadar])
    console.log("probe: hydrate 1 key ok")
    const prismaMod = await import("@/lib/prisma")
    console.log("probe: prisma module keys:", Object.keys(prismaMod.prisma ?? {}).slice(0, 4))
    const allKeys = Object.values(PROMPT_KEYS)
    for (let i = 1; i <= allKeys.length; i += 5) {
      const batch = allKeys.slice(0, i)
      const t0 = Date.now()
      await promptRegistry.hydrate(batch)
      console.log(`probe: hydrate ${batch.length} keys ok in ${Date.now() - t0}ms`)
    }
    console.log("probe: hydrate all ok")
    findMany.mockResolvedValue([
      { templateKey: PROMPT_KEYS.commentRadar, version: 2, content: "DB v2 内容", type: "system", status: "active" },
    ])
    await promptRegistry.reload()
    console.log("probe: after reload")
    expect(promptRegistry.get(PROMPT_KEYS.commentRadar).content).toBe("DB v2 内容")
    expect(promptRegistry.get(PROMPT_KEYS.commentRadar).version).toBe(2)
  })

  it("reload 失败不抛错（回落 seed）", async () => {
    promptRegistry.__resetForTest()
    findMany.mockRejectedValue(new Error("db down"))
    await expect(promptRegistry.reload()).resolves.toBeUndefined()
    expect(promptRegistry.get(PROMPT_KEYS.commentRadar).fromSeed).toBe(true)
  })
})
