import { describe, expect, it } from "vitest"

import {
  buildLocalChecklist,
  buildXhsNoteDraft,
  checkEmojiDensity,
  computeEmojiDensity,
  extractJsonObject,
  extractXhsTags,
  findAbsoluteTerms,
  findDenseParagraphs,
  parseXhsReviewPayload,
  parseXhsVariantsPayload,
} from "@/lib/xhs-review"

describe("extractJsonObject（容错提取第一个 { 到最后一个 }）", () => {
  it("直接解析纯 JSON", () => {
    expect(extractJsonObject(`{"score": 80}`)).toEqual({ score: 80 })
  })

  it("容忍 ```json 代码块与前后废话", () => {
    const raw = `好的，结果如下：\n\`\`\`json\n{"score": 75, "issues": []}\n\`\`\`\n以上。`
    expect(extractJsonObject(raw)).toEqual({ score: 75, issues: [] })
  })

  it("无法解析时返回 null 而不是抛错", () => {
    expect(extractJsonObject("没有 JSON")).toBeNull()
    expect(extractJsonObject("{ 残缺")).toBeNull()
  })
})

describe("parseXhsReviewPayload", () => {
  it("解析 score/issues/checklist 并夹取分数区间", () => {
    const raw = `{"score": 120, "issues": [{"type": "spoken", "text": "太书面", "suggestion": "口语化"}], "checklist": [{"item": "hook", "status": "fail", "note": "首行无钩子"}]}`
    const result = parseXhsReviewPayload(raw)
    expect(result.score).toBe(100)
    expect(result.issues).toHaveLength(1)
    expect(result.checklist[0]).toEqual({ item: "hook", status: "fail", note: "首行无钩子" })
  })

  it("非法 status 归一为 pass，空 text 的 issue 被过滤", () => {
    const raw = `{"score": 60, "issues": [{"type": "x", "text": ""}], "checklist": [{"item": "style", "status": "unknown"}]}`
    const result = parseXhsReviewPayload(raw)
    expect(result.issues).toHaveLength(0)
    expect(result.checklist[0].status).toBe("pass")
  })

  it("完全无法解析时返回安全默认", () => {
    expect(parseXhsReviewPayload("模型乱输出")).toEqual({ score: 0, issues: [], checklist: [] })
  })
})

describe("parseXhsVariantsPayload", () => {
  it("解析 titles/hooks/tags 并去重去空", () => {
    const raw = `{"titles": ["A", "A", "", "B"], "hooks": ["钩子1"], "tags": ["护肤", "护肤"]}`
    expect(parseXhsVariantsPayload(raw)).toEqual({
      titles: ["A", "B"],
      hooks: ["钩子1"],
      tags: ["护肤"],
    })
  })

  it("解析失败返回三个空数组", () => {
    expect(parseXhsVariantsPayload("无")).toEqual({ titles: [], hooks: [], tags: [] })
  })
})

describe("emoji 密度", () => {
  it("计算每百字 emoji 数", () => {
    expect(computeEmojiDensity("")).toBe(0)
    // emoji 是代理对（length=2），100 汉字 + 2 emoji = 104 字符 → 2/104*100 ≈ 1.9
    const text = `${"文".repeat(100)}😀😀`
    expect(computeEmojiDensity(text)).toBe(1.9)
  })

  it("密度过低/过高都给出提示，区间内不提示", () => {
    expect(checkEmojiDensity("没有表情的正文内容".repeat(10)).issue?.type).toBe("emoji")
    expect(checkEmojiDensity(`😀`.repeat(20)).issue?.type).toBe("emoji")
    const ok = `${"文".repeat(100)}😀`
    expect(checkEmojiDensity(ok).issue).toBeNull()
  })
})

describe("广告法绝对化用语", () => {
  it("命中「最/第一/国家级」并给出替换建议", () => {
    const issues = findAbsoluteTerms("这是市面上最好的产品，销量第一")
    expect(issues.length).toBeGreaterThanOrEqual(2)
    expect(issues[0].type).toBe("absolute")
    expect(issues[0].suggestion).toContain("绝对化")
  })

  it("正常表达不命中", () => {
    expect(findAbsoluteTerms("我用过觉得不错的一款")).toHaveLength(0)
  })
})

describe("本地自检清单", () => {
  it("覆盖 emoji/absolute/title/density 四个确定性维度", () => {
    const checklist = buildLocalChecklist("正常标题", "分段一\n\n分段二 😀")
    expect(checklist.map((item) => item.item)).toEqual(["emoji", "absolute", "title", "density"])
  })

  it("超长标题与不换段文字块被标记", () => {
    const dense = Array.from({ length: 6 }, (_, i) => `第${i + 1}行内容`).join("\n")
    expect(findDenseParagraphs(dense)).toBe(true)
    const checklist = buildLocalChecklist("这是一个非常非常非常长的标题超过二十个字的标题", dense)
    expect(checklist.find((item) => item.item === "title")?.status).toBe("warn")
    expect(checklist.find((item) => item.item === "density")?.status).toBe("warn")
  })
})

describe("笔记结构模板", () => {
  it("extractXhsTags 提取并去重 #标签", () => {
    expect(extractXhsTags("正文 #护肤 #好物 #护肤")).toEqual(["护肤", "好物"])
  })

  it("buildXhsNoteDraft 组织为 标题/正文/话题标签 三段", () => {
    const draft = buildXhsNoteDraft("我的标题\n正文内容 #护肤")
    expect(draft).toContain("【标题】我的标题")
    expect(draft).toContain("【正文】")
    expect(draft).toContain("【话题标签】#护肤")
    // 正文里的行内标签被收拢到标签段
    expect(draft).not.toContain("正文内容 #护肤")
  })
})
