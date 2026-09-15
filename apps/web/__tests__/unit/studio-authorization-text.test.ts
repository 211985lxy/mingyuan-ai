import { describe, expect, it } from "vitest"
import {
  findAuthorizationNamePlaceholder,
  isSelfExplanatoryNamePlaceholder,
  splitAuthorizationTextByPlaceholder,
} from "@/lib/studio/authorization-text"

describe("findAuthorizationNamePlaceholder", () => {
  it("识别服务端统一占位「（您的姓名）」", () => {
    expect(
      findAuthorizationNamePlaceholder("我 （您的姓名） 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人。"),
    ).toBe("（您的姓名）")
  })

  it("识别历史配置的字面 xxx 占位", () => {
    expect(
      findAuthorizationNamePlaceholder("我xxx特此声明，授权蝉镜使用我的视频来创作蝉镜数字人。"),
    ).toBe("xxx")
  })

  it("识别大写 XXX 与 {name} 模板占位", () => {
    expect(findAuthorizationNamePlaceholder("我 XXX 特此声明")).toBe("XXX")
    expect(findAuthorizationNamePlaceholder("我{name}特此声明")).toBe("{name}")
  })

  it("已写入具体姓名的原文返回 null", () => {
    expect(findAuthorizationNamePlaceholder("我 李项羽 特此声明，授权蝉镜使用我的视频。")).toBeNull()
  })
})

describe("isSelfExplanatoryNamePlaceholder", () => {
  it("全角/半角「（您的姓名）」视为自解释，不再叠加提示", () => {
    expect(isSelfExplanatoryNamePlaceholder("（您的姓名）")).toBe(true)
    expect(isSelfExplanatoryNamePlaceholder("(您的姓名)")).toBe(true)
  })

  it("xxx / {name} / 某某 需要额外提示", () => {
    expect(isSelfExplanatoryNamePlaceholder("xxx")).toBe(false)
    expect(isSelfExplanatoryNamePlaceholder("{name}")).toBe(false)
    expect(isSelfExplanatoryNamePlaceholder("某某")).toBe(false)
  })
})

describe("splitAuthorizationTextByPlaceholder", () => {
  it("按占位符切出高亮段", () => {
    const segments = splitAuthorizationTextByPlaceholder("我xxx特此声明，授权蝉镜。")
    expect(segments).toEqual([
      { type: "text", value: "我" },
      { type: "name", value: "xxx" },
      { type: "text", value: "特此声明，授权蝉镜。" },
    ])
  })

  it("识别「（您的姓名）」并切段", () => {
    const segments = splitAuthorizationTextByPlaceholder("我 （您的姓名） 特此声明。")
    expect(segments).toEqual([
      { type: "text", value: "我 " },
      { type: "name", value: "（您的姓名）" },
      { type: "text", value: " 特此声明。" },
    ])
  })

  it("无占位符时返回单段原文", () => {
    expect(splitAuthorizationTextByPlaceholder("我 lxy 特此声明。")).toEqual([
      { type: "text", value: "我 lxy 特此声明。" },
    ])
  })

  it("多个占位符全部切出", () => {
    const segments = splitAuthorizationTextByPlaceholder("xxx授权xxx")
    expect(segments.filter((segment) => segment.type === "name")).toHaveLength(2)
  })

  it("空字符串安全", () => {
    expect(splitAuthorizationTextByPlaceholder("")).toEqual([])
  })
})
