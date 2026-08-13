import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"

describe("AIM unified workbench turn", () => {
  it("rejects browser-forged semantic understanding", () => {
    expect(aimExecuteBodySchema.safeParse({
      agentId: "content_producer",
      sourceEnvelope: {
        currentUserRequest: "写20篇完整脚本",
        relevantConversation: [],
        referenceMaterials: [],
      },
      targetFormats: ["video_script"],
      semanticBrief: "只改开头",
    }).success).toBe(false)
  })

  it("keeps legacy intent routing out of the main workbench path", () => {
    const files = [
      "src/features/aim/hooks/use-aim-workbench.ts",
      "src/hooks/use-aim-generation-actions.ts",
      "src/app/(dashboard)/aim/page.tsx",
    ].map((file) => readFileSync(file, "utf8")).join("\n")

    expect(files).not.toMatch(/useAimTurnIntentGate|AimTurnIntentConfirmBar|confirmedTurnIntent|intent-resolve/)
  })
})
