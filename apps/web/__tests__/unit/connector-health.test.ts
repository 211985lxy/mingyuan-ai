import { describe, expect, it, vi } from "vitest"

import { getConnectorHealth } from "@/lib/aim/connectors/connector-health"
import { createFeishuConnector } from "@/lib/aim/connectors/feishu-connector"

describe("optional AIM connectors", () => {
  it("reports Feishu disabled without exposing config values", () => {
    expect(getConnectorHealth("feishu", {})).toEqual({
      channel: "feishu", status: "disabled", message: expect.stringContaining("网页端"),
    })
  })

  it("keeps the core save successful when connector side effects fail", async () => {
    const connector = createFeishuConnector({
      env: {}, notify: vi.fn(), submitApproval: vi.fn(), writeBackSameRecord: vi.fn(),
    })
    expect((await connector.notify({ generationId: "gen-1", message: "Review" })).status).toBe("disabled")
    expect((await connector.submitApproval({ generationId: "gen-1", recordId: "rec-1" })).status).toBe("disabled")
  })
})
