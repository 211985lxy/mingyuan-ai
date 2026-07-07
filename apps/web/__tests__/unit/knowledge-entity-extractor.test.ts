import { describe, expect, it } from "vitest"

import {
  buildExtractionPrompt,
  parseExtractionResult,
  ENTITY_TYPES,
  RELATION_TYPES,
} from "@/lib/knowledge-entity-extractor"

describe("knowledge-entity-extractor", () => {
  describe("buildExtractionPrompt", () => {
    it("构造 system + user prompt，user 含原文", () => {
      const content = "老王直播间主推美白精华，主打敏感肌美白。"
      const prompt = buildExtractionPrompt(content)
      expect(prompt.system).toContain("知识图谱抽取器")
      expect(prompt.system).toContain("person")
      expect(prompt.user).toContain(content)
    })

    it("超长内容被截断到 3000 字", () => {
      const long = "测试".repeat(2000)
      const prompt = buildExtractionPrompt(long)
      expect(prompt.user.length).toBeLessThan(long.length + 200)
    })

    it("在 prompt 中列出全部实体/关系类型", () => {
      const prompt = buildExtractionPrompt("x")
      for (const t of ENTITY_TYPES) expect(prompt.system).toContain(t)
      for (const t of RELATION_TYPES) expect(prompt.system).toContain(t)
    })
  })

  describe("parseExtractionResult", () => {
    it("解析标准 JSON 对象", () => {
      const raw = JSON.stringify({
        entities: [
          { name: "老王", type: "person", aliases: ["老王头"] },
          { name: "美白精华", type: "product" },
        ],
        relations: [{ from: "老王", to: "美白精华", type: "sells", evidence: "直播间主推" }],
      })
      const result = parseExtractionResult(raw)
      expect(result.entities).toHaveLength(2)
      expect(result.entities[0]).toEqual({ name: "老王", type: "person", aliases: ["老王头"] })
      expect(result.relations).toHaveLength(1)
      expect(result.relations[0].type).toBe("sells")
    })

    it("剥离 markdown 代码块", () => {
      const raw = "```json\n{\"entities\":[{\"name\":\"品牌\",\"type\":\"brand\"}],\"relations\":[]}\n```"
      const result = parseExtractionResult(raw)
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0].name).toBe("品牌")
    })

    it("空输入返回空结果", () => {
      expect(parseExtractionResult("")).toEqual({ entities: [], relations: [] })
      expect(parseExtractionResult("   ")).toEqual({ entities: [], relations: [] })
    })

    it("畸形 JSON 返回空结果而不抛错", () => {
      expect(parseExtractionResult("这不是JSON")).toEqual({ entities: [], relations: [] })
      expect(parseExtractionResult("{broken")).toEqual({ entities: [], relations: [] })
    })

    it("从夹杂文本中抢救 JSON", () => {
      const raw = "好的，以下是结果：{\"entities\":[{\"name\":\"精华\",\"type\":\"product\"}],\"relations\":[]} 完成"
      const result = parseExtractionResult(raw)
      expect(result.entities).toHaveLength(1)
    })

    it("丢弃非法实体类型", () => {
      const raw = JSON.stringify({
        entities: [
          { name: "合法", type: "person" },
          { name: "非法", type: "unknown_type" },
        ],
        relations: [],
      })
      const result = parseExtractionResult(raw)
      expect(result.entities).toHaveLength(1)
      expect(result.entities[0].name).toBe("合法")
    })

    it("丢弃引用了不存在实体的关系", () => {
      const raw = JSON.stringify({
        entities: [{ name: "A", type: "person" }],
        relations: [{ from: "A", to: "B不存在", type: "sells" }],
      })
      const result = parseExtractionResult(raw)
      expect(result.relations).toHaveLength(0)
    })

    it("丢弃自环关系（from === to）", () => {
      const raw = JSON.stringify({
        entities: [{ name: "A", type: "person" }],
        relations: [{ from: "A", to: "A", type: "mentions" }],
      })
      expect(parseExtractionResult(raw).relations).toHaveLength(0)
    })

    it("实体名去重（同 name+type）", () => {
      const raw = JSON.stringify({
        entities: [
          { name: "老王", type: "person" },
          { name: "老王", type: "person", aliases: ["别名"] },
        ],
        relations: [],
      })
      expect(parseExtractionResult(raw).entities).toHaveLength(1)
    })

    it("清洗实体名首尾标点并限制长度", () => {
      const raw = JSON.stringify({
        entities: [{ name: "【老王】。", type: "person" }],
        relations: [],
      })
      const result = parseExtractionResult(raw)
      expect(result.entities[0].name).toBe("老王")
    })

    it("evidence 被截断到 200 字", () => {
      const longEvidence = "证".repeat(300)
      const raw = JSON.stringify({
        entities: [
          { name: "A", type: "person" },
          { name: "B", type: "product" },
        ],
        relations: [{ from: "A", to: "B", type: "sells", evidence: longEvidence }],
      })
      const result = parseExtractionResult(raw)
      expect(result.relations[0].evidence?.length).toBe(200)
    })

    it("接受裸数组格式（兼容某些模型输出）", () => {
      const raw = JSON.stringify([{ name: "实体", type: "brand" }])
      const result = parseExtractionResult(raw)
      expect(result.entities).toHaveLength(1)
    })

    it("aliases 清洗并限制 5 个", () => {
      const raw = JSON.stringify({
        entities: [{ name: "老王", type: "person", aliases: ["【别名1】", "别名2", "", "别名3", "别名4", "别名5", "别名6"] }],
        relations: [],
      })
      const result = parseExtractionResult(raw)
      expect(result.entities[0].aliases).toHaveLength(5)
      expect(result.entities[0].aliases).toContain("别名1")
    })
  })
})
