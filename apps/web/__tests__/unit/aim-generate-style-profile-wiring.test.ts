/**
 * generate 正门应接通写作风格档案（与 chat / scripts.generate 对齐）。
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")

describe("aim generate 风格档案接线", () => {
  it("prepareAimContext 走 loadStyleProfileForGenerate / getStyleProfileBlock", () => {
    const assembly = readFileSync(
      path.join(ROOT, "src/lib/aim-harness/context-assembly.ts"),
      "utf8",
    )
    const loader = readFileSync(
      path.join(ROOT, "src/lib/aim-harness/context/load-style-profile.ts"),
      "utf8",
    )

    expect(assembly).toContain("loadStyleProfileForGenerate")
    expect(assembly).toContain("mergeStyleIntoKnowledgeBlock")
    expect(assembly).toContain("styleProfileBlock: styleBlock")
    expect(loader).toContain("getStyleProfileBlock(userId, projectId ?? null)")
    expect(loader).toContain("useStyleProfile")
  })
})
