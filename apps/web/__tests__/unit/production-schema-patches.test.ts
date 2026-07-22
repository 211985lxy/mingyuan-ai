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

  it("repairs the channel inspiration and reply outbox schema idempotently", () => {
    const inspirationPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `Inspiration`") && patch.includes("externalMessageId"),
    )
    const outboxPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `ChannelReplyOutbox`"),
    )
    const outboxUpgradePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `ChannelReplyOutbox`"),
    )

    expect(inspirationPatch).toContain("ADD COLUMN IF NOT EXISTS `externalChatId`")
    expect(inspirationPatch).toContain("ADD COLUMN IF NOT EXISTS `externalAccountId`")
    expect(outboxPatch).toContain("ChannelReplyOutbox_inspirationId_fkey")
    expect(outboxPatch).toContain("ChannelReplyOutbox_inspirationId_replyType_key")
    expect(outboxUpgradePatch).toContain("ADD COLUMN IF NOT EXISTS `availableAt`")
    expect(outboxUpgradePatch).toContain("ADD INDEX IF NOT EXISTS `ChannelReplyOutbox_status_availableAt_idx`")
  })
})
