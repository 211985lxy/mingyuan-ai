import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/lib/aim-agent-handlers.ts"), "utf8")
const start = source.indexOf("class DeepCopywriterHandler")
const end = source.indexOf("// ─── 3.", start)
const deepCopywriterBlock = source.slice(start, end)

describe("deep copywriter boundaries", () => {
  it("keeps final output as one long-form draft without tail modules", () => {
    expect(deepCopywriterBlock).toContain('new Set<ContentFormat>(["raw_copy"])')
    expect(deepCopywriterBlock).toContain('"可拆分方向"模块')
    expect(deepCopywriterBlock).toContain("私域话术")
    expect(deepCopywriterBlock).toContain("正文最后一句写完就停止")
    expect(deepCopywriterBlock).toContain("确认尾句")
  })
})
