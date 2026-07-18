import { describe, expect, it } from "vitest"

import {
  parseImageTextDoc,
  serializeImageTextDoc,
  type ImageTextDoc,
} from "@/lib/image-text-doc"

/** 断言 parse→serialize→parse 幂等：第二次解析结果与第一次完全一致，二次序列化文本稳定 */
function expectRoundTripIdempotent(source: string) {
  const doc1 = parseImageTextDoc(source)
  const text1 = serializeImageTextDoc(doc1.header, doc1.pages)
  const doc2 = parseImageTextDoc(text1)
  const text2 = serializeImageTextDoc(doc2.header, doc2.pages)
  expect(doc2).toEqual(doc1)
  expect(text2).toBe(text1)
  return doc1
}

describe("parseImageTextDoc 分页标记", () => {
  it("「第 N 页」标记：尾随标题进 title", () => {
    const doc = parseImageTextDoc("第 1 页：封面钩子\n正文一\n第 2 页：方法页\n正文二")
    expect(doc.pages).toHaveLength(2)
    expect(doc.pages[0]).toMatchObject({ title: "封面钩子", body: "正文一", note: "" })
    expect(doc.pages[1]).toMatchObject({ title: "方法页", body: "正文二", note: "" })
  })

  it("「Page N」「P N」英文标记", () => {
    const doc = parseImageTextDoc("Page 01｜封面\n内容一\npage 2 - 内页\n内容二\nP3：尾页\n内容三")
    expect(doc.pages).toHaveLength(3)
    expect(doc.pages[0].title).toBe("封面")
    expect(doc.pages[1].title).toBe("内页")
    expect(doc.pages[2].title).toBe("尾页")
  })

  it("裸「封面」标记与角色括注剥除", () => {
    const doc = parseImageTextDoc("【封面】\n大标题文案\n第 2 页（内页）：真正的标题\n正文")
    expect(doc.pages).toHaveLength(2)
    expect(doc.pages[0].title).toBe("")
    expect(doc.pages[0].body).toBe("大标题文案")
    expect(doc.pages[1].title).toBe("真正的标题")
  })

  it("markdown 标题前缀的页标记也能识别", () => {
    const doc = parseImageTextDoc("## 第 1 页：钩子\n正文\n### Page 02：方法\n步骤")
    expect(doc.pages).toHaveLength(2)
    expect(doc.pages[0].title).toBe("钩子")
    expect(doc.pages[1].title).toBe("方法")
  })

  it("角色词 + 分隔符 + 真标题（第 1 页｜封面：钩子标题）", () => {
    const doc = parseImageTextDoc("第 1 页｜封面：钩子标题\n正文")
    expect(doc.pages[0].title).toBe("钩子标题")
  })
})

describe("parseImageTextDoc 页内标签与 header", () => {
  it("标题/配图/正文类标签各归其位", () => {
    const doc = parseImageTextDoc(
      "第 1 页\n标题：大字标题\n副标题：补充一句\n配图脚本：深蓝背景，居中构图",
    )
    expect(doc.pages[0]).toMatchObject({
      title: "大字标题",
      body: "补充一句",
      note: "深蓝背景，居中构图",
    })
  })

  it("未知「xx：yy」行保持原样进 body", () => {
    const doc = parseImageTextDoc("第 1 页：标题\n时间：3 分钟\n地点：杭州")
    expect(doc.pages[0].body).toBe("时间：3 分钟\n地点：杭州")
  })

  it("无标签行进 body，不做首行标题提升（幂等关键）", () => {
    const doc = parseImageTextDoc("第 1 页\n第一行其实是正文\n第二行也是正文")
    expect(doc.pages[0].title).toBe("")
    expect(doc.pages[0].body).toBe("第一行其实是正文\n第二行也是正文")
  })

  it("页标记之前的内容存入 header", () => {
    const doc = parseImageTextDoc("笔记标题：三个方法\n正文开场白\n#小红书话题\n\n第 1 页：封面\n内容")
    expect(doc.header).toBe("笔记标题：三个方法\n正文开场白\n#小红书话题")
    expect(doc.pages).toHaveLength(1)
  })

  it("解析不出页结构时整体作为 1 页，header 为空", () => {
    const doc = parseImageTextDoc("今天分享三个方法。\n方法一：早睡。\n方法二：早起。")
    expect(doc.header).toBe("")
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0]).toMatchObject({ title: "", note: "" })
    expect(doc.pages[0].body).toContain("方法二：早起。")
  })

  it("空输入不炸", () => {
    const doc = parseImageTextDoc("")
    expect(doc.pages).toHaveLength(1)
    expect(serializeImageTextDoc(doc.header, doc.pages)).toBe("")
  })
})

describe("parse→serialize→parse 往返幂等", () => {
  it("结构化文稿（header + 多页 + 标签）", () => {
    expectRoundTripIdempotent(
      "笔记标题：三个方法\n正文开场\n\n第 1 页：封面钩子\n副标题：痛点在这儿\n配图：蓝色背景\n\n第 2 页：方法\n要点一二三\n配图脚本：画面描述",
    )
  })

  it("英文标记 + markdown 标题 + 角色括注的混合文稿", () => {
    expectRoundTripIdempotent(
      "# 8 页图文结构\n\nPage 01｜封面：大钩子\n核心文案：一句话\n视觉提示词：3:4 竖版\n\n## 第 2 页（内页）\n正文一\n配图：场景图",
    )
  })

  it("无结构文本（单页直出，serialize 与原文一致）", () => {
    const source = "今天分享三个方法。\n方法一：早睡。"
    const doc = parseImageTextDoc(source)
    expect(serializeImageTextDoc(doc.header, doc.pages)).toBe(source)
    expectRoundTripIdempotent(source)
  })

  it("空标题页（首行正文不被误提升）", () => {
    expectRoundTripIdempotent("第 1 页：有标题\n正文\n\n第 2 页\n只有正文一\n只有正文二")
  })

  it("body 内部段落空行保留", () => {
    expectRoundTripIdempotent("第 1 页：标题\n第一段\n\n第二段")
  })
})

describe("增删改后序列化", () => {
  it("删除中间页后页码自动重排", () => {
    const doc = parseImageTextDoc("第 1 页：甲\n一\n第 2 页：乙\n二\n第 3 页：丙\n三")
    const kept = doc.pages.filter((_, index) => index !== 1)
    const text = serializeImageTextDoc(doc.header, kept)
    expect(text).toBe("第 1 页：甲\n一\n\n第 2 页：丙\n三")
    expectRoundTripIdempotent(text)
  })

  it("新增空白页后出现在正确位置", () => {
    const doc = parseImageTextDoc("第 1 页：甲\n一")
    const pages = [
      doc.pages[0],
      { id: "page-new", title: "新页", body: "新内容", note: "" },
    ]
    const text = serializeImageTextDoc(doc.header, pages)
    expect(text).toBe("第 1 页：甲\n一\n\n第 2 页：新页\n新内容")
  })

  it("编辑 title/body/note 后回写保持 canonical 范式", () => {
    const doc: ImageTextDoc = {
      header: "笔记标题",
      pages: [
        { id: "page-1", title: "改后的标题", body: "改后的正文", note: "改后的画面" },
      ],
    }
    const text = serializeImageTextDoc(doc.header, doc.pages)
    expect(text).toBe("笔记标题\n\n第 1 页：改后的标题\n改后的正文\n配图：改后的画面")
    expectRoundTripIdempotent(text)
  })
})
