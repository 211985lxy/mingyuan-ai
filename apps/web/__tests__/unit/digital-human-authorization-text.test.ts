import { describe, expect, it } from "vitest"
import {
  DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER,
  DigitalHumanProviderError,
  buildDigitalHumanAuthorizationText,
  hasExactDigitalHumanAuthorizationText,
} from "@/lib/digital-human-provider"

const TEMPLATE = "我 {name} 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。"
const FIXED = "我 李相宇 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。"

describe("授权原文按声明人实例化", () => {
  it("把 {name} 替换为声明人姓名，其余字符逐字保持", () => {
    const built = buildDigitalHumanAuthorizationText(TEMPLATE, "张三")
    expect(built).toBe("我 张三 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。")
    expect(built).not.toContain(DIGITAL_HUMAN_AUTH_NAME_PLACEHOLDER)
    // 与账号持有人版本仅姓名不同：同字数姓名替换后长度一致
    const sameLengthName = buildDigitalHumanAuthorizationText(TEMPLATE, "欧阳明")
    expect(sameLengthName.length).toBe(FIXED.length)
    expect(sameLengthName.replace("欧阳明", "李相宇")).toBe(FIXED)
  })

  it("多条占位符一并替换", () => {
    const built = buildDigitalHumanAuthorizationText("我是 {name}，{name} 确认授权。", "李四")
    expect(built).toBe("我是 李四，李四 确认授权。")
  })

  it("姓名首尾空白与内部连续空白被归一，避免念稿多处空格", () => {
    expect(buildDigitalHumanAuthorizationText(TEMPLATE, "  王  五  ")).toContain("我 王 五 特此声明")
  })

  it("缺姓名时 fail-closed，绝不退化成占位符原文", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(() => buildDigitalHumanAuthorizationText(TEMPLATE, empty))
        .toThrowError(DigitalHumanProviderError)
      try {
        buildDigitalHumanAuthorizationText(TEMPLATE, empty)
      } catch (error) {
        expect((error as DigitalHumanProviderError).code).toBe("AUTH_NAME_REQUIRED")
      }
    }
  })

  it("不含占位符的固定文案保持原行为（仅账号持有人本人克隆）", () => {
    expect(buildDigitalHumanAuthorizationText(FIXED, null)).toBe(FIXED)
    expect(buildDigitalHumanAuthorizationText(FIXED, "张三")).toBe(FIXED)
  })

  it("逐字比对以实例化后的原文为准：换名即失配", () => {
    const zhangsan = buildDigitalHumanAuthorizationText(TEMPLATE, "张三")
    expect(hasExactDigitalHumanAuthorizationText(zhangsan, "chanjing", "张三")).toBe(
      hasExactDigitalHumanAuthorizationText(
        "我 张三 特此声明，授权蝉镜使用我的视频来创作蝉镜数字人，并在我的蝉镜账号中使用。",
        "chanjing",
        "张三",
      ),
    )
    // 念的是别人的名字 -> 缺名 fail-closed，比对必然不通过
    expect(hasExactDigitalHumanAuthorizationText(zhangsan, "chanjing", "李四")).toBe(false)
    expect(hasExactDigitalHumanAuthorizationText(zhangsan, "chanjing", null)).toBe(false)
  })
})
