-- Additive: 用户问题库 UserQuestionCard。
-- 模型早在 3e86b620 就进了 schema，但一直没有配套迁移，生产库缺表，
-- 飞书灵感采集里的「用户问题聚合」因此静默失败（日志只有 upsert failed, swallowed）。
-- 幂等：建表用 IF NOT EXISTS，外键先查 INFORMATION_SCHEMA 再添加，可重复执行。

CREATE TABLE IF NOT EXISTS `UserQuestionCard` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `originalText` TEXT NOT NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'other',
    `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
    `customerRef` VARCHAR(191) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `userQuoteSnippets` JSON NOT NULL,
    `similarityGroupKey` VARCHAR(191) NULL,
    `topicSelectionId` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserQuestionCard_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `UserQuestionCard_similarityGroupKey_idx`(`similarityGroupKey`),
    INDEX `UserQuestionCard_status_idx`(`status`),
    INDEX `UserQuestionCard_projectId_createdAt_idx`(`projectId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserQuestionCard'
    AND CONSTRAINT_NAME = 'UserQuestionCard_userId_fkey');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `UserQuestionCard` ADD CONSTRAINT `UserQuestionCard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserQuestionCard'
    AND CONSTRAINT_NAME = 'UserQuestionCard_projectId_fkey');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `UserQuestionCard` ADD CONSTRAINT `UserQuestionCard_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
