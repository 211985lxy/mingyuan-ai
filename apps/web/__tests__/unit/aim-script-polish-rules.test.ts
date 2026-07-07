import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/lib/aim-agent-handlers.ts"), "utf8")

describe("AIM script polish rules", () => {
  it("keeps spoken rhythm and visual change rules in script prompts", () => {
    expect(source).toContain("每10-12秒约40个字")
    expect(source).toContain("小转折、新观点或情绪点")
    expect(source).toContain("每2-4秒安排一个视觉变化点")
    expect(source).toContain("文盲式修改")
    expect(source).toContain("初中生听不懂就重写")
  })
})
