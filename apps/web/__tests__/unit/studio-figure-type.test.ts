import { describe, expect, it } from "vitest"
import { pickFigureType } from "@/features/studio/video-workbench-data"

const wenhao = [
  { type: "sit_body", width: 1080, height: 1920 },
  { type: "circle_view", width: 728, height: 728 },
]

describe("pickFigureType", () => {
  it("按画面比例精确匹配（竖屏选 1080x1920 的形态）", () => {
    expect(pickFigureType(wenhao, "9:16")).toBe("sit_body")
  })

  it("横屏无精确匹配时回退 whole_body", () => {
    const figures = [
      { type: "circle_view", width: 728, height: 728 },
      { type: "whole_body", width: 1920, height: 1080 },
    ]
    expect(pickFigureType(figures, "16:9")).toBe("whole_body")
  })

  it("既无精确匹配也无 whole_body 时取第一个（不硬编码该形象不具备的形态）", () => {
    expect(pickFigureType(wenhao, "16:9")).toBe("sit_body")
  })

  it("无形态列表时返回 null，交由供应商判定", () => {
    expect(pickFigureType(undefined, "9:16")).toBeNull()
    expect(pickFigureType([], "9:16")).toBeNull()
  })
})
