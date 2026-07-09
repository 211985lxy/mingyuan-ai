import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("aim chat route project isolation", () => {
  const routePath = join(process.cwd(), "src/app/api/aim/chat/route.ts")
  const source = readFileSync(routePath, "utf8")

  it("项目对话按当前项目读取风格档案", () => {
    expect(source).toContain("getStyleProfileBlock(user.id, projectId || null)")
  })

  it("项目对话只召回项目记忆，不混入全局记忆", () => {
    expect(source).toContain("? retrieveAimMemory({ userId: user.id, projectId, agentId }).catch(() => [])")
    expect(source).toContain(": retrieveLayeredAimMemory({ userId: user.id, projectId, agentId }).catch(() => [])")
  })
})
