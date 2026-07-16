import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "src/app/(dashboard)/ai-hot/page.tsx"),
  "utf8",
)

describe("AI hot page", () => {
  it("does not render watch-account video recommendations", () => {
    expect(source).not.toContain("WatchRecommendationsPanel")
    expect(source).not.toContain("今日可拍对标视频")
  })
})
