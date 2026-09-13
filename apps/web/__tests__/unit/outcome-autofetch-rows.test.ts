import { describe, expect, it } from "vitest"

import { toAutofetchVideoRows } from "@/lib/aim/outcome-autofetch-store"

/**
 * WP-1.1 数据源换到第三方公开通道后的字段映射纪律。
 * 关键点：抖音不对外公开播放量（play_count 恒为 0），不得把 0 当事实写入回流。
 */
describe("toAutofetchVideoRows", () => {
  it("播放为 0 时不写 0，而是留空表示未知", () => {
    const rows = toAutofetchVideoRows([
      { externalWorkId: "aweme_1", stats: { views: 0, likes: 8546, comments: 12, saves: 3779, shares: 30 } },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.statistics?.playCount).toBeUndefined()
    expect(rows[0]?.statistics?.diggCount).toBe(8546)
    expect(rows[0]?.statistics?.collectCount).toBe(3779)
    expect(rows[0]?.statistics?.shareCount).toBe(30)
  })

  it("播放有真实值时照常写入", () => {
    const rows = toAutofetchVideoRows([
      { externalWorkId: "aweme_2", stats: { views: 1234, likes: 10 } },
    ])
    expect(rows[0]?.statistics?.playCount).toBe(1234)
  })

  it("itemId/videoId 用作品键，供已发布内容按 aweme_id 匹配", () => {
    const rows = toAutofetchVideoRows([{ externalWorkId: "7631823607013936394", stats: {} }])
    expect(rows[0]?.itemId).toBe("7631823607013936394")
    expect(rows[0]?.videoId).toBe("7631823607013936394")
    expect(rows[0]?.shareUrl).toBeNull()
  })

  it("缺字段留空而不是编造 0", () => {
    const rows = toAutofetchVideoRows([{ externalWorkId: "aweme_3", stats: { views: 5 } }])
    expect(rows[0]?.statistics?.diggCount).toBeUndefined()
    expect(rows[0]?.statistics?.commentCount).toBeUndefined()
  })
})
