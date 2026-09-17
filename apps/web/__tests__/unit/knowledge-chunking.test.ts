import { describe, expect, it } from "vitest"
import {
  CHUNK_EMBED_BUDGET,
  DEFAULT_CHUNK_SIZE,
  splitIntoChunks,
} from "@/lib/llm/chunking"

/**
 * 分块器契约测试。
 *
 * 最关键的一条是「块长 ≤ CHUNK_EMBED_BUDGET」—— 它是整个 P0 的存在理由：
 * 只要这个不变量被破坏，长条目的内容又会退回「被嵌入接口截断」的老问题。
 */

const MAX = CHUNK_EMBED_BUDGET

function longest(chunks: Array<{ text: string }>): number {
  return chunks.reduce((max, chunk) => Math.max(max, chunk.text.length), 0)
}

/** 与 CHUNK_THRESHOLD = 5000 同量级的真实语料 */
function buildRealisticCorpus(): string {
  const paragraph =
    "客户访谈记录：对方是深圳一家做工业阀门的中型制造商，年营收约两亿。" +
    "他明确表示目前的痛点是售后响应慢，最关心的是备件库存周转率，也提到希望把经销商培训标准化。"
  return Array.from({ length: 65 }, (_, i) => `第${i + 1}次访谈 ${paragraph}`).join("\n")
}

describe("splitIntoChunks 输入边界", () => {
  it("空串与纯空白返回空数组", () => {
    expect(splitIntoChunks("")).toEqual([])
    expect(splitIntoChunks("   \n\n \t ")).toEqual([])
  })

  it("短文本切为单块且内容无损", () => {
    const text = "这是一条很短的知识。"
    const chunks = splitIntoChunks(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text.trim()).toBe(text)
    expect(chunks[0].idx).toBe(0)
  })

  it("idx 连续从 0 递增", () => {
    const chunks = splitIntoChunks(buildRealisticCorpus())
    expect(chunks.every((chunk, i) => chunk.idx === i)).toBe(true)
  })
})

describe("splitIntoChunks 核心不变量", () => {
  it("真实 5000 字量级语料的每块都在嵌入预算内", () => {
    const corpus = buildRealisticCorpus()
    expect(corpus.length).toBeGreaterThan(5000)

    const chunks = splitIntoChunks(corpus)
    expect(chunks.length).toBeGreaterThan(12)
    expect(longest(chunks)).toBeLessThanOrEqual(MAX)
  })

  it("任意参数组合下块长都不超预算", () => {
    const corpus = buildRealisticCorpus()
    const sizes = [80, 120, 200, 400, 479, 500, 1000, 3000]
    const overlaps = [0, 30, 80, 200, 999, -10]

    for (const size of sizes) {
      for (const overlap of overlaps) {
        const chunks = splitIntoChunks(corpus, { size, overlap })
        expect(longest(chunks), `size=${size} overlap=${overlap}`).toBeLessThanOrEqual(MAX)
      }
    }
  })

  it("size 超预算时自动下调且不丢内容", () => {
    const corpus = buildRealisticCorpus()
    const chunks = splitIntoChunks(corpus, { size: 3000 })
    const joined = chunks.map((chunk) => chunk.text).join("\n")

    expect(joined).toContain("第1次访谈")
    expect(joined).toContain("第65次访谈")
    expect(longest(chunks)).toBeLessThanOrEqual(MAX)
  })

  it("无标点长串被硬切且不丢字", () => {
    const chunks = splitIntoChunks("甲".repeat(1000))
    const total = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)

    expect(total).toBeGreaterThanOrEqual(1000)
    expect(longest(chunks)).toBeLessThanOrEqual(MAX)
  })

  it("负 overlap 视为 0", () => {
    const chunks = splitIntoChunks("字".repeat(600), { size: 200, overlap: -50 })
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks[1].text.startsWith("字".repeat(200))).toBe(true)
  })
})

describe("splitIntoChunks 内容覆盖", () => {
  it("所有行式段落都能在结果中找到", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `要点${i}：这是第${i}条不可丢失的客户原话内容。`)
    const joined = splitIntoChunks(lines.join("\n\n")).map((chunk) => chunk.text).join("\n")

    const missing = lines.filter((line) => !joined.includes(line))
    expect(missing).toEqual([])
  })

  it("尾部内容被覆盖——旧实现会在此处丢失", () => {
    const chunks = splitIntoChunks(buildRealisticCorpus())
    const joined = chunks.map((chunk) => chunk.text).join("\n")

    expect(joined).toContain("第65次访谈")
  })

  it("markdown 表格与列表不被破坏", () => {
    const md =
      "| 列A | 列B |\n| --- | --- |\n| 值1 | 值2 |\n\n- 项目一\n- 项目二\n- 项目三\n\n## 小节\n正文内容。"
    const joined = splitIntoChunks(md).map((chunk) => chunk.text).join("\n")

    expect(joined).toContain("项目二")
    expect(joined).toContain("正文内容")
  })
})

describe("splitIntoChunks 重叠与确定性", () => {
  it("相邻块保留指定长度的重叠前缀", () => {
    const text = "啊".repeat(50) + "。".repeat(50) + "嗯".repeat(50) + "。".repeat(50)
    const chunks = splitIntoChunks(text, { size: 120, overlap: 30, minSize: 10 })

    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].text.startsWith(chunks[i - 1].text.slice(-30))).toBe(true)
    }
  })

  it("同一输入产出完全一致的分块（保证 contentHash 判失效可靠）", () => {
    const corpus = buildRealisticCorpus()
    expect(JSON.stringify(splitIntoChunks(corpus))).toBe(JSON.stringify(splitIntoChunks(corpus)))
  })

  it("默认参数与显式传参一致", () => {
    const corpus = buildRealisticCorpus()
    const explicit = splitIntoChunks(corpus, { size: DEFAULT_CHUNK_SIZE })
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(splitIntoChunks(corpus)))
  })
})
