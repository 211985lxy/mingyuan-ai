import { describe, expect, it } from "vitest"
import {
  findAuthorizationNamePlaceholder,
  splitAuthorizationTextByPlaceholder,
} from "@/lib/studio/authorization-text"

describe("findAuthorizationNamePlaceholder", () => {
  it("识别字面 xxx 占位", () => {
    expect(
      findAuthorizationNamePlaceholder("我xxx特此声明，授权蝉镜使用我的视频来创作蝉镜数字人。"),
    ).toBe("xxx")
  })

  it("识别大写 XXX 与 {name} 正规占位", () => {
    expect(findAuthorizationNamePlaceholder("我 XXX 特此声明")).toBe("XXX")
    expect(findAuthorizationNamePlaceholder("我{name}特此声明")).toBe("{name}")
  })

  it("已实例化真实姓名的原文返回 null", () => {
    expect(findAuthorizationNamePlaceholder("我 lxy 特此声明，授权蝉镜使用我的视频。")).toBeNull()
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
