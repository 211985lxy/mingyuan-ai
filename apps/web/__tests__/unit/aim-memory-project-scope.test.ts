import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("aim memory project scope", () => {
  it("项目记忆默认不再自动拼接用户全局记忆", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/aim-memory.ts"), "utf8")

    expect(source).toContain("projectId: input.projectId ?? null")
    expect(source).not.toContain("const [projectRows, globalRows] = await Promise.all([")
    expect(source).not.toContain("retrieveAimMemory({ ...input, projectId: null, topK })")
  })
})
