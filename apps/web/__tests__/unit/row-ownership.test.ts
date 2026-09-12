import { describe, expect, it } from "vitest"

import {
  ROW_OWNERSHIP_FIELD,
  isRowVisibleToProject,
  readRowOwner,
} from "@/lib/data-platform/row-ownership"

const PROJECT = "cmspu8aju000uain46i3k3uff"
const OTHER = "cmqi18cu70006qh9k6p6qyf8s"

describe("readRowOwner", () => {
  it("读取文本列归属", () => {
    expect(readRowOwner({ [ROW_OWNERSHIP_FIELD]: PROJECT })).toBe(PROJECT)
  })

  it("兼容飞书返回数组值", () => {
    expect(readRowOwner({ [ROW_OWNERSHIP_FIELD]: [PROJECT] })).toBe(PROJECT)
  })

  it("缺失、空串、空白都视为无归属", () => {
    expect(readRowOwner({})).toBe("")
    expect(readRowOwner({ [ROW_OWNERSHIP_FIELD]: "" })).toBe("")
    expect(readRowOwner({ [ROW_OWNERSHIP_FIELD]: "   " })).toBe("")
    expect(readRowOwner({ [ROW_OWNERSHIP_FIELD]: null })).toBe("")
  })
})

describe("isRowVisibleToProject", () => {
  it("无归属的行是共享数据，所有人可见", () => {
    expect(isRowVisibleToProject({}, PROJECT)).toBe(true)
    expect(isRowVisibleToProject({}, null)).toBe(true)
    // 采集来源写入的对标账号没有归属列 → 行为与改造前保持一致
    expect(isRowVisibleToProject({ 达人昵称: "博容老申聊暖通" }, null)).toBe(true)
  })

  it("有归属的行仅归属项目可见", () => {
    const row = { [ROW_OWNERSHIP_FIELD]: PROJECT }
    expect(isRowVisibleToProject(row, PROJECT)).toBe(true)
    expect(isRowVisibleToProject(row, OTHER)).toBe(false)
  })

  it("未绑定项目的调用者看不到任何私有行", () => {
    expect(isRowVisibleToProject({ [ROW_OWNERSHIP_FIELD]: PROJECT }, null)).toBe(false)
  })

  it("忽略归属值两侧空白", () => {
    expect(isRowVisibleToProject({ [ROW_OWNERSHIP_FIELD]: ` ${PROJECT} ` }, PROJECT)).toBe(true)
  })
})
