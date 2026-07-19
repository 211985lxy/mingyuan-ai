-- Forward repair for a database that recorded the original 20260711100000
-- migration without creating ContentOutcome. Fresh databases already have
-- this table, so the repair must be idempotent.
CREATE TABLE IF NOT EXISTS `ContentOutcome` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `topicSelectionId` VARCHAR(30) NULL,
    `projectId` VARCHAR(191) NULL,
    `platform` VARCHAR(40) NULL,
    `publishedAt` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `collectWindowDay` INTEGER NOT NULL,
    `qualifiedCommentCount` INTEGER NULL,
    `dmCount` INTEGER NULL,
    `qualifiedLeadCount` INTEGER NULL,
    `appointmentCount` INTEGER NULL,
    `dealCount` INTEGER NULL,
    `revenue` DECIMAL(14, 2) NULL,
    `views` INTEGER NULL,
    `likes` INTEGER NULL,
    `comments` INTEGER NULL,
    `saves` INTEGER NULL,
    `shares` INTEGER NULL,
    `audienceFeedback` TEXT NULL,
    `userVerdict` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ContentOutcome_userId_collectedAt_idx`(`userId`, `collectedAt`),
    INDEX `ContentOutcome_generationId_idx`(`generationId`),
    UNIQUE INDEX `ContentOutcome_userId_generationId_collectWindowDay_key`(`userId`, `generationId`, `collectWindowDay`),
    PRIMARY KEY (`id`),
    CONSTRAINT `ContentOutcome_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `ContentOutcome_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `AimGeneration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
