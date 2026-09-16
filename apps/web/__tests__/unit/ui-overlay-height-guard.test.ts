import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * 覆盖层高度门禁：居中弹层与上/下抽屉必须自带高度上限与纵向滚动。
 *
 * 回归背景（2026-09-16 线上）：数字人弹层（`digital-human-video-dialog`）在口播文案较长时
 * 内容超过视口高度，弹层是 fixed + 垂直居中，于是**上下同时溢出屏幕**；遮罩又锁住了页面
 * 滚动 —— 标题和底部「提交生成」按钮都够不着。
 *
 * 根因不是那一个弹层的疏漏，而是原语只限宽度不限高度，把"记得写 max-h"这件事交给了
 * 每个业务弹层（当时 39 个 DialogContent 里只有 17 个自己写了）。所以门禁锁在**原语**上：
 * 业务侧可以覆盖（tailwind-merge 取后者），但原语必须保证"忘了写也不会坏"。
 */

const source = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8")

describe("覆盖层高度门禁", () => {
  it("弹层原语自带高度上限与纵向滚动", () => {
    const dialog = source("src/components/ui/dialog.tsx")
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]")
    expect(dialog).toContain("overflow-y-auto")
  })

  it("抽屉原语：上/下方向有高度上限，且整体可纵向滚动", () => {
    const sheet = source("src/components/ui/sheet.tsx")
    // 上/下抽屉是 h-auto，没有上限时高度随内容无限增长
    expect(sheet).toContain("data-[side=top]:max-h-[calc(100dvh-2rem)]")
    expect(sheet).toContain("data-[side=bottom]:max-h-[calc(100dvh-2rem)]")
    // 左右抽屉是 h-full，已被视口约束，但内容超高仍需自己能滚
    expect(sheet).toContain("overflow-y-auto")
  })

  it("锚定式浮层由 --available-height 自行约束（不重复加码）", () => {
    // 这两类由 Base UI 按触发器到视口边缘的可用空间限制，本就不受该缺陷影响；
    // 此断言用于说明它们为何不在改动范围内，并防止约束被移除。
    expect(source("src/components/ui/select.tsx")).toContain("max-h-(--available-height)")
    expect(source("src/components/ui/dropdown-menu.tsx")).toContain("max-h-(--available-height)")
  })
})
