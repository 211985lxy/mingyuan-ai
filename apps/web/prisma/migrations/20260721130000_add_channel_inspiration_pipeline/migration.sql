ALTER TABLE `Inspiration`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `processingStage` VARCHAR(32) NULL,
  ADD COLUMN `externalMessageId` VARCHAR(191) NULL,
  ADD COLUMN `externalChatId` VARCHAR(191) NULL,
  ADD COLUMN `externalSenderId` VARCHAR(191) NULL,
  ADD COLUMN `externalOccurredAt` DATETIME(3) NULL,
  ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
  ADD COLUMN `sourceUrl` VARCHAR(800) NULL,
  ADD COLUMN `videoCopyExtractionId` VARCHAR(191) NULL,
  ADD COLUMN `knowledgeEntryId` VARCHAR(191) NULL,
  ADD COLUMN `topicSelectionId` VARCHAR(191) NULL,
  ADD COLUMN `replyStatus` VARCHAR(24) NULL,
  ADD COLUMN `replyAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `replyErrorMessage` TEXT NULL,
  ADD COLUMN `replyClaimToken` VARCHAR(191) NULL,
  ADD COLUMN `replyClaimedAt` DATETIME(3) NULL,
  ADD COLUMN `repliedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Inspiration_dedupeKey_key` ON `Inspiration`(`dedupeKey`);
CREATE UNIQUE INDEX `Inspiration_replyClaimToken_key` ON `Inspiration`(`replyClaimToken`);
CREATE INDEX `Inspiration_projectId_createdAt_idx` ON `Inspiration`(`projectId`, `createdAt` DESC);
CREATE INDEX `Inspiration_source_externalChatId_idx` ON `Inspiration`(`source`, `externalChatId`);
CREATE INDEX `Inspiration_replyStatus_updatedAt_idx` ON `Inspiration`(`replyStatus`, `updatedAt`);

ALTER TABLE `Inspiration`
  ADD CONSTRAINT `Inspiration_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VideoCopyExtraction`
  ADD COLUMN `provider` VARCHAR(40) NOT NULL DEFAULT 'primary',
  ADD COLUMN `fallbackJobId` VARCHAR(120) NULL;

CREATE TABLE `ChannelBinding` (
  `id` VARCHAR(191) NOT NULL,
  `platform` VARCHAR(40) NOT NULL,
  `externalChatId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `triggerMode` VARCHAR(32) NOT NULL DEFAULT 'mention_or_keyword',
  `triggerKeywords` JSON NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ChannelBinding_platform_externalChatId_key`(`platform`, `externalChatId`),
  INDEX `ChannelBinding_userId_status_idx`(`userId`, `status`),
  INDEX `ChannelBinding_projectId_status_idx`(`projectId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ChannelBinding`
  ADD CONSTRAINT `ChannelBinding_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ChannelBinding`
  ADD CONSTRAINT `ChannelBinding_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
