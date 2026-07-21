import { describe, expect, it } from "vitest"
import { PRODUCTION_SCHEMA_PATCHES } from "../../scripts/apply-production-schema-patches.mjs"

describe("production schema patches", () => {
  it("repairs execution trace telemetry columns idempotently", () => {
    const tracePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `AimExecutionTrace`"),
    )

    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `inputTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `outputTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `cachedTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `costCny` DECIMAL(10,6) NULL")
  })

  it("repairs the AIM channel conversation schema idempotently", () => {
    const bindingPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `ChannelBinding`"),
    )
    const conversationPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `AimConversation`"),
    )
    const messagePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `AimConversationMessage`"),
    )

    expect(bindingPatch).toContain("ADD COLUMN IF NOT EXISTS `routeTarget`")
    expect(bindingPatch).toContain("ADD COLUMN IF NOT EXISTS `defaultAgentId`")
    expect(conversationPatch).toContain("AimConversation_platform_externalChatId_agentId_key")
    expect(messagePatch).toContain("AimConversationMessage_dedupeKey_key")
    expect(messagePatch).toContain("AimConversationMessage_conversationId_fkey")
  })
})
