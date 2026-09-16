import { describe, expect, it } from "vitest"
import {
  DIGITAL_HUMAN_AUTH_NAME_DISPLAY,
  DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER,
  buildDigitalHumanAuthorizationText,
} from "@/lib/digital-human-provider"

const TEMPLATE = "我 {name} 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。"
const FIXED = "我 李相宇 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。"

describe("授权原文姓名位统一为通用占位", () => {
  it("{name} 替换为占位文案，不读账号姓名", () => {
    const built = buildDigitalHumanAuthorizationText(TEMPLATE)
    expect(built).toBe(
      `我 ${DIGITAL_HUMAN_AUTH_NAME_DISPLAY} 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。`,
    )
    expect(built).not.toContain(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER)
  })

  it("多条占位符一并替换", () => {
    expect(buildDigitalHumanAuthorizationText("我是 {name}，{name} 确认授权。")).toBe(
      `我是 ${DIGITAL_HUMAN_AUTH_NAME_DISPLAY}，${DIGITAL_HUMAN_AUTH_NAME_DISPLAY} 确认授权。`,
    )
  })

  it("换行与首尾空白归一，不产生多余空行", () => {
    expect(buildDigitalHumanAuthorizationText("\r\n  我是 {name}。  \r\n")).toBe(
      `我是 ${DIGITAL_HUMAN_AUTH_NAME_DISPLAY}。`,
    )
  })

  it("不含占位符的固定文案原样返回（兼容单一文案形态）", () => {
    expect(buildDigitalHumanAuthorizationText(FIXED)).toBe(FIXED)
  })

  it("姓名不参与校验：任意账号得到同一份展示原文，不残留个人姓名", () => {
    const first = buildDigitalHumanAuthorizationText(TEMPLATE)
    const second = buildDigitalHumanAuthorizationText(TEMPLATE)
    expect(first).toBe(second)
    // 拼音缩写账号（lxy）不再出现在原文里
    expect(first).not.toContain("lxy")
    expect(first).toContain(DIGITAL_HUMAN_AUTH_NAME_DISPLAY)
  })
})
