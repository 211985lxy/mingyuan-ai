import { describe, expect, it } from "vitest"

import {
  buildMemoryExtractionPrompt,
  buildMemoryExtractionMessages,
  parseMemoryExtraction,
  formatAimMemoryBlock,
  mergeAimMemoryRows,
  MEMORY_KINDS,
} from "@/lib/aim-memory"

describe("aim-memory", () => {
  describe("buildMemoryExtractionPrompt / Messages", () => {
    it("构造包含对话原文的 user prompt", () => {
      const messages = [
        { role: "user" as const, content: "我们主打敏感肌美白" },
        { role: "assistant" as const, content: "好的，定位敏感肌美白" },
      ]
      const user = buildMemoryExtractionPrompt(messages)
      expect(user).toContain("用户：我们主打敏感肌美白")
      expect(user).toContain("助手：好的，定位敏感肌美白")
    })

    it("返回 system + user 两条消息", () => {
      const messages = [{ role: "user" as const, content: "x" }]
      const msgs = buildMemoryExtractionMessages(messages)
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe("system")
      expect(msgs[0].content).toContain("长期记忆提炼器")
      expect(msgs[1].role).toBe("user")
    })

    it("system prompt 列出可提炼的记忆类型", () => {
      const msgs = buildMemoryExtractionMessages([{ role: "user", content: "x" }])
      // 可提炼类型（conversation_summary 不由 LLM 直接产出）
      const extractable = MEMORY_KINDS.filter((k) => k !== "conversation_summary")
      for (const k of extractable) expect(msgs[0].content).toContain(k)
    })

    it("超长对话被截断", () => {
      const long = Array(50)
        .fill(null)
        .map(() => ({ role: "user" as const, content: "测试对话内容".repeat(100) }))
      const user = buildMemoryExtractionPrompt(long)
      expect(user.length).toBeLessThanOrEqual(4000)
    })
  })

  describe("parseMemoryExtraction", () => {
    it("解析标准 JSON", () => {
      const raw = JSON.stringify({
        memories: [
          { kind: "decision", content: "主打敏感肌美白" },
          { kind: "fact", content: "目标人群 25-35 岁职场女性" },
        ],
      })
      const result = parseMemoryExtraction(raw)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ kind: "decision", content: "主打敏感肌美白" })
    })

    it("空输入返回空数组", () => {
      expect(parseMemoryExtraction("")).toEqual([])
      expect(parseMemoryExtraction("   ")).toEqual([])
    })

    it("畸形 JSON 返回空数组不抛错", () => {
      expect(parseMemoryExtraction("不是JSON")).toEqual([])
      expect(parseMemoryExtraction("{broken")).toEqual([])
    })

    it("从夹杂文本中抢救 JSON", () => {
      const raw = `好的：{"memories":[{"kind":"fact","content":"客单价300"}]} 完成`
      expect(parseMemoryExtraction(raw)).toHaveLength(1)
    })

    it("剥离 markdown 代码块", () => {
      const raw = "```json\n{\"memories\":[{\"kind\":\"decision\",\"content\":\"x\"}]}\n```"
      expect(parseMemoryExtraction(raw)).toHaveLength(1)
    })

    it("丢弃非法 kind", () => {
      const raw = JSON.stringify({
        memories: [
          { kind: "decision", content: "合法" },
          { kind: "invalid_kind", content: "非法" },
        ],
      })
      const result = parseMemoryExtraction(raw)
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe("合法")
    })

    it("丢弃空 content", () => {
      const raw = JSON.stringify({
        memories: [
          { kind: "fact", content: "" },
          { kind: "fact", content: "   " },
          { kind: "fact", content: "有效" },
        ],
      })
      expect(parseMemoryExtraction(raw)).toHaveLength(1)
    })

    it("content 去重（同 kind+content）", () => {
      const raw = JSON.stringify({
        memories: [
          { kind: "decision", content: "重复内容" },
          { kind: "decision", content: "重复内容" },
        ],
      })
      expect(parseMemoryExtraction(raw)).toHaveLength(1)
    })

    it("content 截断到 300 字", () => {
      const long = "字".repeat(400)
      const raw = JSON.stringify({ memories: [{ kind: "fact", content: long }] })
      expect(parseMemoryExtraction(raw)[0].content.length).toBe(300)
    })

    it("最多保留 8 条", () => {
      const items = Array(15)
        .fill(null)
        .map((_, i) => ({ kind: "fact", content: `事实${i}` }))
      const raw = JSON.stringify({ memories: items })
      expect(parseMemoryExtraction(raw)).toHaveLength(8)
    })

    it("接受裸数组格式", () => {
      const raw = JSON.stringify([{ kind: "decision", content: "裸数组决策" }])
      expect(parseMemoryExtraction(raw)).toHaveLength(1)
    })
  })

  describe("formatAimMemoryBlock", () => {
    it("空列表返回空字符串", () => {
      expect(formatAimMemoryBlock([])).toBe("")
    })

    it("渲染记忆为带标签的文本块", () => {
      const rows = [
        { id: "1", kind: "decision", content: "主打美白", agentId: "a", createdAt: new Date(), relevance: 1 },
        { id: "2", kind: "preference", content: "少用术语", agentId: "a", createdAt: new Date(), relevance: 1 },
      ]
      const block = formatAimMemoryBlock(rows)
      expect(block).toContain("=== 历史记忆")
      expect(block).toContain("[已确认决策] 主打美白")
      expect(block).toContain("[用户偏好] 少用术语")
    })

    it("未知 kind 使用原始值", () => {
      const rows = [
        { id: "1", kind: "custom_kind", content: "x", agentId: "a", createdAt: new Date(), relevance: 1 },
      ]
      expect(formatAimMemoryBlock(rows)).toContain("[custom_kind] x")
    })
  })

  describe("mergeAimMemoryRows", () => {
    it("优先保留项目记忆，再补全全局记忆，并按 kind 排序", () => {
      const now = new Date("2026-07-07T10:00:00.000Z")
      const rows = mergeAimMemoryRows(
        [
          { id: "p1", kind: "fact", content: "项目事实", agentId: "a", createdAt: now, relevance: 1 },
          { id: "p2", kind: "decision", content: "优先保留项目决策", agentId: "a", createdAt: now, relevance: 1 },
        ],
        [
          { id: "g1", kind: "decision", content: "优先保留项目决策", agentId: "a", createdAt: new Date("2026-07-06T10:00:00.000Z"), relevance: 1 },
          { id: "g2", kind: "preference", content: "全局口语化", agentId: "a", createdAt: new Date("2026-07-05T10:00:00.000Z"), relevance: 1 },
        ],
        6,
      )

      expect(rows).toHaveLength(3)
      expect(rows[0].content).toBe("优先保留项目决策")
      expect(rows[1].content).toBe("全局口语化")
      expect(rows[2].content).toBe("项目事实")
    })

    it("遵守 topK 限制", () => {
      const rows = mergeAimMemoryRows(
        [
          { id: "1", kind: "decision", content: "a", agentId: "a", createdAt: new Date(), relevance: 1 },
          { id: "2", kind: "preference", content: "b", agentId: "a", createdAt: new Date(), relevance: 1 },
        ],
        [{ id: "3", kind: "fact", content: "c", agentId: "a", createdAt: new Date(), relevance: 1 }],
        2,
      )

      expect(rows).toHaveLength(2)
      expect(rows.map((row) => row.content)).toEqual(["a", "b"])
    })
  })
})
