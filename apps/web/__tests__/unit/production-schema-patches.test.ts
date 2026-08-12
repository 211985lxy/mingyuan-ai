import { describe, expect, it } from "vitest"
import { PRODUCTION_SCHEMA_PATCHES } from "../../scripts/apply-production-schema-patches.mjs"

describe("production schema patches", () => {
  it("adds project scope to TopicSelection for the weekly content board", () => {
    const topicSelectionPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `TopicSelection`") && patch.includes("`projectId`"),
    )

    expect(topicSelectionPatch).toContain("TopicSelection_projectId_createdAt_idx")
  })

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

  it("repairs operating-system tables and telemetry columns idempotently", () => {
    const runEventPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `AimRunEvent`") && patch.includes("workflowId"),
    )
    const contentOutcomePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `ContentOutcome`"),
    )
    const baselinePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `TaskEfficiencyBaseline`"),
    )
    const reviewCyclePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `ReviewCycle`"),
    )
    const learningPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `LearningCandidate`"),
    )
    const evalPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `EvalFixtureVersion`"),
    )

    expect(runEventPatch).toContain("ADD COLUMN IF NOT EXISTS `finalDisposition`")
    expect(contentOutcomePatch).toContain("ADD COLUMN IF NOT EXISTS `verdictNote`")
    expect(baselinePatch).toContain("TaskEfficiencyBaseline_workflowId_taskType_validFrom_key")
    expect(reviewCyclePatch).toContain("signedApprovalId")
    expect(learningPatch).toContain("LearningCandidate_requestId_key")
    expect(evalPatch).toContain("EvalFixtureVersion_sourceCandidateId_fkey")
  })

  it("creates the custom AIM skill table required by the public workbench", () => {
    const customSkillPatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("CREATE TABLE IF NOT EXISTS `AimCustomSkill`"),
    )

    expect(customSkillPatch).toContain("`skillId` VARCHAR(191) NOT NULL")
    expect(customSkillPatch).toContain("`prompt` MEDIUMTEXT NOT NULL")
    expect(customSkillPatch).toContain("AimCustomSkill_agentId_skillId_key")
    expect(customSkillPatch).toContain("AimCustomSkill_agentId_idx")
  })
})
