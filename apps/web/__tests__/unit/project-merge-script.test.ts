import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("project merge script safety contract", () => {
  it("requires explicit source, target, apply, and confirmation before it can write", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../scripts/merge-account-projects.ts"),
      "utf8",
    )

    expect(source).toContain('"--source-project"')
    expect(source).toContain('"--target-project"')
    expect(source).toContain('"--apply"')
    expect(source).toContain('"--confirm"')
    expect(source).toContain("--confirm must equal --target-project")
  })

  it("moves shared content, preserves source membership history, and archives rather than deletes", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../scripts/merge-account-projects.ts"),
      "utf8",
    )

    expect(source).toContain("knowledgeEntry")
    expect(source).toContain("aimGeneration")
    expect(source).toContain("projectMember.upsert")
    expect(source).toContain("target.userId")
    expect(source).toContain("id: { in: memberIds }")
    expect(source).toContain('data: { status: "archived" }')
    expect(source).not.toContain("clientProject.delete")
  })
})
