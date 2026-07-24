import { describe, expect, it } from "vitest"

import {
  buildDocxWithJszip,
  buildOfficeExportParagraphs,
  buildAimExportDocx,
} from "@/lib/aim/export-office-docx"

describe("export-office-docx", () => {
  it("splits markdown headings and strips light markup", () => {
    const paragraphs = buildOfficeExportParagraphs({
      title: "客户案例包",
      sections: [
        {
          heading: "公众号文章",
          content: "## 为什么慢\n\n**决策成本**高。\n### 对策\n- 先做小切口",
        },
      ],
    })

    expect(paragraphs[0]).toEqual({ text: "客户案例包", style: "Heading1" })
    expect(paragraphs[1]).toEqual({ text: "公众号文章", style: "Heading2" })
    expect(paragraphs.some((item) => item.style === "Heading2" && item.text === "为什么慢")).toBe(true)
    expect(paragraphs.some((item) => item.style === "Normal" && item.text.includes("决策成本"))).toBe(true)
    expect(paragraphs.some((item) => item.style === "Heading3" && item.text === "对策")).toBe(true)
  })

  it("builds a downloadable docx via jszip fallback", async () => {
    const buffer = await buildDocxWithJszip([
      { text: "标题", style: "Heading1" },
      { text: "正文一行", style: "Normal" },
    ])
    expect(buffer.byteLength).toBeGreaterThan(100)
    // ZIP magic
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK")
  })

  it("buildAimExportDocx returns filename and buffer", async () => {
    const result = await buildAimExportDocx({
      title: "测试/导出",
      sections: [{ heading: "口播", content: "前三秒钩子" }],
    })
    expect(result.fileName).toBe("测试_导出.docx")
    expect(result.buffer.byteLength).toBeGreaterThan(100)
    expect(["officecli", "jszip"]).toContain(result.engine)
  })
})
