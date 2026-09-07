/**
 * Prompt Registry 单测（不连真实 DB：@/lib/prisma 用替身）。
 *
 * 覆盖：
 * - 选版优先级：显式 version > active > qualified > draft > 内置 seed
 * - DB 失败回落 seed 且不抛错，warn 每 key 只打一次
 * - seed 幂等（重复 registerSeed / 重复 get 行为稳定）
 * - getMessages 返回 [{role:"system"},{role:"user"}]
 * - 六个 key 的内置 seed 非空且可回落
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_SEEDS } from "@/lib/prompt/seeds"
import { PROMPT_KEYS, type PromptStatus } from "@/lib/prompt/types"

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

describe("prompt-registry 批0 六个内置 seed", () => {
  it("六个 key 全部注册且内容非空", () => {
    expect(PROMPT_SEEDS).toHaveLength(6)
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
