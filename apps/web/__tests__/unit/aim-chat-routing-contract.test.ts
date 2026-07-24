import { describe, expect, it } from "vitest"

import { shouldInjectChatIpWiki } from "@/lib/aim-agent-handlers"
import { resolveAimChatRuntimeTask } from "@/lib/aim/services/chat/context-assembly"

describe("AIM chat routing contract", () => {
  it("keeps project IP context independent from methodology selection", () => {
    expect(shouldInjectChatIpWiki({
      projectId: "project-xiangyu",
    })).toBe(true)
    expect(shouldInjectChatIpWiki({
      projectId: undefined,
    })).toBe(false)
  })

  it("aligns local edits and version selection away from new-copy runtime", () => {
    expect(resolveAimChatRuntimeTask("new_copy", "local_edit")).toBe("light_edit")
    expect(resolveAimChatRuntimeTask("new_copy", "select_version")).toBe("light_edit")
    expect(resolveAimChatRuntimeTask("new_copy", "formal_delivery")).toBe("new_copy")
  })
})
