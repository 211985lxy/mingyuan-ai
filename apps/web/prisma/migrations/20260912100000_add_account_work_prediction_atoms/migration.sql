-- WP-A1 AccountWorkAsset / WP-A3 PublishPrediction / WP-A5 KnowledgeAtom
-- 幂等：逐表检查 INFORMATION_SCHEMA 后再 CREATE。

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AccountWorkAsset');
SET @sql := IF(@tbl = 0,
  'CREATE TABLE `AccountWorkAsset` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(24) NOT NULL DEFAULT ''douyin'',
    `awemeId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `coverUrl` VARCHAR(1000) NULL,
    `shareUrl` VARCHAR(1000) NULL,
    `signalSnapshot` JSON NULL,
    `transcript` MEDIUMTEXT NULL,
    `transcriptStatus` VARCHAR(20) NOT NULL DEFAULT ''pending'',
    `transcriptHash` VARCHAR(64) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `AccountWorkAsset_accountId_awemeId_key` (`accountId`, `awemeId`),
    INDEX `AccountWorkAsset_projectId_publishedAt_idx` (`projectId`, `publishedAt`),
    INDEX `AccountWorkAsset_userId_projectId_idx` (`userId`, `projectId`),
    INDEX `AccountWorkAsset_transcriptStatus_idx` (`transcriptStatus`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PublishPrediction');
SET @sql := IF(@tbl = 0,
  'CREATE TABLE `PublishPrediction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `windowDays` INTEGER NOT NULL,
    `viewsMin` INTEGER NOT NULL,
    `viewsMax` INTEGER NOT NULL,
    `likesMin` INTEGER NOT NULL,
    `likesMax` INTEGER NOT NULL,
    `commentsMin` INTEGER NOT NULL,
    `commentsMax` INTEGER NOT NULL,
    `savesMin` INTEGER NOT NULL,
    `savesMax` INTEGER NOT NULL,
    `sharesMin` INTEGER NOT NULL,
    `sharesMax` INTEGER NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `rationale` TEXT NOT NULL,
    `accountHistoryHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reconciledAt` DATETIME(3) NULL,
    `verdict` VARCHAR(16) NULL,
    `actualViews` INTEGER NULL,
    `actualLikes` INTEGER NULL,
    `actualComments` INTEGER NULL,
    `actualSaves` INTEGER NULL,
    `actualShares` INTEGER NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `PublishPrediction_generationId_windowDays_key` (`generationId`, `windowDays`),
    INDEX `PublishPrediction_userId_createdAt_idx` (`userId`, `createdAt`),
    INDEX `PublishPrediction_verdict_idx` (`verdict`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'KnowledgeAtom');
SET @sql := IF(@tbl = 0,
  'CREATE TABLE `KnowledgeAtom` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `valueGrade` VARCHAR(2) NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `KnowledgeAtom_entryId_contentHash_key` (`entryId`, `contentHash`),
    INDEX `KnowledgeAtom_userId_projectId_kind_idx` (`userId`, `projectId`, `kind`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
