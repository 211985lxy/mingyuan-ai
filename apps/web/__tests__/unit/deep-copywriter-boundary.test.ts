import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// deep_copywriter 已按 aim-ui-config.ts 别名归一为 work_editor（作品编辑），
// 输出约束随迁至 aim-agent-work-editor.ts，且允许格式扩展了 wechat_article。
const source = readFileSync(join(process.cwd(), "src/lib/aim-agent-work-editor.ts"), "utf8")

describe("work editor boundaries (deep copywriter successor)", () => {
  it("keeps final output as one long-form draft without tail modules", () => {
    expect(source).toContain('new Set<ContentFormat>(["raw_copy", "wechat_article"])')
    expect(source).toContain("私域话术")
    expect(source).toContain("正文最后一句写完就停止")
    expect(source).toContain("确认尾句")
  })
})
