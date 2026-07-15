import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("style profile project scope", () => {
  it("项目内风格沉淀会携带 projectId", () => {
    const clientSource = readFileSync(join(process.cwd(), "src/lib/api/client.ts"), "utf8")
    const routeSource = readFileSync(join(process.cwd(), "src/app/api/aim/evolve-style/route.ts"), "utf8")

    expect(clientSource).toContain("projectId: input.projectId")
    expect(routeSource).toContain("projectId: projectId || null")
  })

  it("项目内润色和生成读取项目风格档案，而不是用户全局", () => {
    const polishSource = readFileSync(join(process.cwd(), "src/lib/aim/services/script-polish.ts"), "utf8")
    const generateSource = readFileSync(join(process.cwd(), "src/app/api/scripts/generate/route.ts"), "utf8")

    expect(polishSource).toContain("getStyleProfileBlock(userId, input.projectId ?? null)")
    expect(generateSource).toContain("getStyleProfileBlock(user.id, projectId ?? null)")
  })
})
