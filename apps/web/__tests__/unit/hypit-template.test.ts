import { describe, expect, it } from "vitest"
import {
  HypitTemplateError,
  listHypitTemplateVariables,
  renderHypitTemplate,
} from "@/lib/hypit-template"

describe("Hypit 模板变量渲染", () => {
  it("替换占位符，并按 XML 规则转义（SVML 是 XML，未转义会破坏文档）", () => {
    const out = renderHypitTemplate({
      template: `<asset:Text value="{{title}}"/>`,
      variables: { title: '供暖 & "节能" <方案>' },
    })
    expect(out).toBe(
      `<asset:Text value="供暖 &amp; &quot;节能&quot; &lt;方案&gt;"/>`,
    )
  })

  it("缺少取值时 fail-closed——绝不能把 {{title}} 原样渲进片子", () => {
    expect(() =>
      renderHypitTemplate({ template: "{{title}}", variables: {} }),
    ).toThrow(HypitTemplateError)
  })

  it("空字符串也算缺值（静默留空同样是事故）", () => {
    expect(() =>
      renderHypitTemplate({ template: "{{title}}", variables: { title: "" } }),
    ).toThrow(/缺少取值/)
  })

  it("{{raw:body}} 跳过转义，用于调用方自备的富文本", () => {
    const out = renderHypitTemplate({
      template: "{{raw:body}}|{{body}}",
      variables: { body: "<b>粗</b>" },
    })
    expect(out).toBe("<b>粗</b>|&lt;b&gt;粗&lt;/b&gt;")
  })

  it("同一变量出现多次时全部替换；多余的变量忽略", () => {
    const out = renderHypitTemplate({
      template: "{{a}}-{{b}}-{{a}}",
      variables: { a: "1", b: "2", unused: "x" },
    })
    expect(out).toBe("1-2-1")
  })

  it("数字按字符串渲染", () => {
    expect(renderHypitTemplate({ template: "n={{n}}", variables: { n: 42 } })).toBe("n=42")
  })

  it("listHypitTemplateVariables 能提前列出模板要求的变量（含 raw 声明）", () => {
    expect(listHypitTemplateVariables("{{a}}{{raw: b}}{{a}}{{c}}")).toEqual(["a", "b", "c"])
  })

  it("无占位符的模板原样返回", () => {
    const template = "<svml>static</svml>"
    expect(renderHypitTemplate({ template, variables: {} })).toBe(template)
    expect(listHypitTemplateVariables(template)).toEqual([])
  })
})
