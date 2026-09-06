-- Keep multi-account channel conversations isolated while sharing the project KB.
ALTER TABLE `AimConversation`
  ADD COLUMN `externalAccountId` VARCHAR(191) NOT NULL DEFAULT '';

DROP INDEX `AimConversation_platform_externalChatId_agentId_key` ON `AimConversation`;

-- MySQL caps identifiers at 64 chars; the auto-style name would be 69, so keep
-- the unique index name short while preserving the four-column uniqueness scope.
CREATE UNIQUE INDEX `AimConversation_platform_extAccountId_extChatId_agentId_key`
  ON `AimConversation`(`platform`, `externalAccountId`, `externalChatId`, `agentId`);
