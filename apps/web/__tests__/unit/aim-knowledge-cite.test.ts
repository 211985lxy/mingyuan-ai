import { describe, expect, it } from "vitest"

import {
  buildKnowledgeCitationMarkdown,
  formatKnowledgeEntryAnchor,
  mapEntriesToKnowledgeUsed,
  normalizeKnowledgeUsed,
  upsertKnowledgeCitationInMethodNote,
} from "@/lib/aim-knowledge-cite"
import { ensureContentCreationTrace } from "@/lib/aim-generation-prompts"
import { buildKnowledgeBlock } from "@/lib/aim-knowledge-context"

describe("aim-knowledge-cite", () => {
  it("maps retrieved entries into knowledgeUsed with labels and snippets", () => {
    const refs = mapEntriesToKnowledgeUsed([
      {
        id: "ke_usp_001",
        title: "核心产品卖点：90天陪跑",
        category: "product_usp",
        content: "29800 对应三个月陪跑，围绕账号方向、内容测试和线索承接落地。",
      },
      {
        id: "ke_pain_001",
        title: "P001｜养了团队没线索",
        category: "customer_pain",
        content: "客户口语触发词：养了三四个人",
      },
    ])

    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({
      id: "ke_usp_001",
      categoryLabel: "产品卖点",
    })
    expect(refs[0].snippet).toContain("29800")
    expect(refs[1].categoryLabel).toBe("客户痛点")
  })

  it("normalizes legacy knowledgeUsed without optional fields", () => {
    const refs = normalizeKnowledgeUsed([
      { id: "a", title: "旧条目", category: "product_usp" },
      { id: 1, title: "坏数据" },
    ])
    expect(refs).toEqual([
      {
        id: "a",
        title: "旧条目",
        category: "product_usp",
        categoryLabel: "产品卖点",
      },
    ])
  })

  it("builds related-original markdown lines", () => {
    const md = buildKnowledgeCitationMarkdown([
      {
        id: "1",
        title: "核心产品卖点：365-29800阶梯",
        category: "product_usp",
        content: "卖点正文",
      },
      {
        id: "2",
        title: "P001｜养了团队",
        category: "customer_pain",
        content: "痛点正文",
      },
    ])
    expect(md).toContain("### 相关原文")
    expect(md).toContain("相关原文见 《核心产品卖点：365-29800阶梯》（产品卖点）")
    expect(md).toContain("相关原文见 《P001｜养了团队》（客户痛点）")
  })

  it("upserts citation block into method note and overwrites model version", () => {
    const next = upsertKnowledgeCitationInMethodNote(
      "### 风格定位\n- 专业\n\n### 相关原文\n- 相关原文见 《编造的》（产品卖点）",
      "### 相关原文\n- 相关原文见 《真实卖点》（产品卖点）",
    )
    expect(next).toContain("真实卖点")
    expect(next).not.toContain("编造的")
    expect(next).toContain("### 风格定位")
  })

  it("formats KE anchors for knowledge blocks", () => {
    expect(formatKnowledgeEntryAnchor({ id: "cmabcdefghijk", category: "product_usp" }))
      .toBe("[KE:cmabcdef|产品卖点]")
  })
})

describe("ensureContentCreationTrace citations", () => {
  it("appends deterministic 相关原文 for product_usp and customer_pain", () => {
    const content = ensureContentCreationTrace("这是可直接使用的正文。", {
      runtimeTask: "rewrite_copy",
      rawInput: "养了三四个人拍内容，每月花钱但没咨询",
      topicTitle: "团队成本",
      targetFormats: ["raw_copy"],
      retrievedEntries: [
        {
          id: "usp1",
          title: "核心产品卖点：365-29800阶梯与90天陪跑",
          category: "product_usp",
          content: "29800三个月陪跑",
        },
        {
          id: "pain1",
          title: "P001｜已经养了3—5人的内容团队但没线索",
          category: "customer_pain",
          content: "客户口语触发词：养了三四个人",
        },
      ],
      taskSpec: {
        goal: "建立专业信任",
        targetCustomer: "中小企业老板",
        contentTask: "推动咨询行动",
      },
      ipWikiBlock: "【人设】专业、直接",
    } as Parameters<typeof ensureContentCreationTrace>[1])

    expect(content).toContain("### 相关原文")
    expect(content).toContain("相关原文见 《核心产品卖点：365-29800阶梯与90天陪跑》（产品卖点）")
    expect(content).toContain("相关原文见 《P001｜已经养了3—5人的内容团队但没线索》（客户痛点）")
    expect(content).toContain("这是可直接使用的正文。")
  })

  it("overwrites model-written 相关原文 with retrieved entries", () => {
    const content = ensureContentCreationTrace(`[[AIM_METHOD_NOTE]]
### 风格定位
- 专业、清晰

### 教学拆解
- 先讲问题再给方法

### 来源标注
- 对标爆款视频来源：未提供/待补充
- 产品卖点：未提供/待补充
- 人设特点：未提供/待补充

### 八字与紫微天命适配
- 八字依据：未提供/待补充
- 紫微依据：未提供/待补充
- 风格映射：未做命理推断；待补充八字或紫微资料后再校准。

### 相关原文
- 相关原文见 《模型编造条目》（产品卖点）
[[/AIM_METHOD_NOTE]]

正文开始`, {
      runtimeTask: "new_copy",
      rawInput: "写一条口播",
      targetFormats: ["raw_copy"],
      retrievedEntries: [
        {
          id: "real_usp",
          title: "真实卖点条目",
          category: "product_usp",
          content: "真实正文",
        },
      ],
      ipWikiBlock: "",
    } as Parameters<typeof ensureContentCreationTrace>[1])

    expect(content).toContain("相关原文见 《真实卖点条目》（产品卖点）")
    expect(content).not.toContain("模型编造条目")
    expect(content).toContain("产品卖点：真实卖点条目")
  })
})

describe("buildKnowledgeBlock anchors", () => {
  it("prefixes entries with KE anchors when id is present", () => {
    const block = buildKnowledgeBlock([
      {
        id: "cmabc123xyz",
        category: "product_usp",
        title: "核心卖点",
        content: "陪跑交付",
      },
    ])
    expect(block).toContain("[KE:cmabc123|产品卖点]")
    expect(block).toContain("核心卖点：陪跑交付")
  })
})
