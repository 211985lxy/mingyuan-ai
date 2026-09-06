-- Keep multi-account channel conversations isolated while sharing the project KB.
ALTER TABLE `AimConversation`
  ADD COLUMN `externalAccountId` VARCHAR(191) NOT NULL DEFAULT '';

DROP INDEX `AimConversation_platform_externalChatId_agentId_key` ON `AimConversation`;

CREATE UNIQUE INDEX `AimConversation_platform_externalAccountId_externalChatId_agentId_key`
  ON `AimConversation`(`platform`, `externalAccountId`, `externalChatId`, `agentId`);
