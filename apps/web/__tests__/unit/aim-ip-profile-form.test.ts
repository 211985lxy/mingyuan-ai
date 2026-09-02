import { describe, expect, it } from "vitest"

import {
  buildProfilePages,
  computeProfileCompleteness,
  IP_PROFILE_FIELDS,
  parseProfileFromPages,
} from "@/lib/aim/ip-profile-form"

describe("IP 档案表单（七栏 ↔ 四页型）", () => {
  it("覆盖七栏并映射到四个核心页型", () => {
    expect(IP_PROFILE_FIELDS).toHaveLength(7)
    const pageTypes = new Set(IP_PROFILE_FIELDS.map((field) => field.pageType))
    expect(pageTypes).toEqual(new Set(["positioning", "audience", "conversion_path", "persona"]))
  })

  it("build → parse 往返一致（表单即编辑器）", () => {
    const form = {
      identity: "我在重庆江北区做重庆火锅店",
      goal: "到店 + 懂行老板人设",
      audience: "20-40 岁聚餐客群",
      pain: "怕锅底是料包兑的",
      offer: "重庆老火锅、现炒牛油锅底",
      usp: "底料每天现炒；毛肚 8 小时直达",
      persona: "说话直，口癖「不新鲜我倒掉」",
    }
    const pages = buildProfilePages(form)
    expect(pages).toHaveLength(4)
    const parsed = parseProfileFromPages(pages)
    expect(parsed).toEqual(form)
  })

  it("跳过全空的页，不写空白档案", () => {
    const pages = buildProfilePages({ identity: "做火锅店的" })
    expect(pages).toHaveLength(1)
    expect(pages[0].pageType).toBe("positioning")
    expect(pages[0].frontmatter.origin).toBe("ip_profile_form")
  })

  it("非表单生成的页整页回填到首栏，不丢编译稿", () => {
    const parsed = parseProfileFromPages([
      { pageType: "positioning", content: "编译生成的定位主张整页内容" },
    ])
    expect(parsed.identity).toContain("编译生成的定位主张")
  })

  it("完整度给出页级缺失与栏级补采建议", () => {
    const empty = computeProfileCompleteness({ pages: [] })
    expect(empty.presentPages).toHaveLength(0)
    expect(empty.missingPages.map((page) => page.label)).toEqual(["定位主张", "目标人群", "成交路径", "人设"])
    expect(empty.missingFieldHints).toHaveLength(7)
    expect(empty.missingFieldHints[0]).toContain("我是谁")

    const partial = computeProfileCompleteness({
      pages: [{ pageType: "positioning", content: "## 我是谁\n做火锅店的" }],
    })
    expect(partial.presentPages).toEqual(["positioning"])
    expect(partial.missingPages.map((page) => page.label)).toEqual(["目标人群", "成交路径", "人设"])
    // 我是谁已填；该页其余栏（内容目标）仍空 → 栏级提示 6 条
    expect(partial.missingFieldHints).toHaveLength(6)
  })
})
