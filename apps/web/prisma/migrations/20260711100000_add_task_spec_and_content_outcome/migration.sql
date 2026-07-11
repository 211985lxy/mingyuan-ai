
-- AlterTable
ALTER TABLE `AimGeneration` ADD COLUMN `calibrationRules` JSON NOT NULL,
    ADD COLUMN `decisionSnapshot` JSON NULL,
    ADD COLUMN `publishPlatform` VARCHAR(191) NULL,
    ADD COLUMN `publishUrl` MEDIUMTEXT NULL,
    ADD COLUMN `retroSnapshots` JSON NOT NULL,
    ADD COLUMN `selectedTopicIndex` INTEGER NULL,
    ADD COLUMN `taskSpec` JSON NULL,
    ADD COLUMN `topicSelectionId` VARCHAR(30) NULL,
    MODIFY `rawInput` MEDIUMTEXT NOT NULL,
    MODIFY `videoScript` MEDIUMTEXT NULL,
    MODIFY `wechatArticle` MEDIUMTEXT NULL,
    MODIFY `momentsPost` MEDIUMTEXT NULL,
    MODIFY `communityMessage` MEDIUMTEXT NULL,
    MODIFY `shootingBrief` MEDIUMTEXT NULL,
    MODIFY `rawCopy` MEDIUMTEXT NULL,
    MODIFY `ipSnapshotUsed` MEDIUMTEXT NULL,
    MODIFY `topicTitle` TEXT NULL,
    MODIFY `hotTopic` TEXT NULL,
    MODIFY `polishInstruction` MEDIUMTEXT NULL,
    MODIFY `reviewNote` MEDIUMTEXT NULL,
    MODIFY `errorMessage` MEDIUMTEXT NULL;

-- CreateTable
CREATE TABLE `ContentOutcome` (
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
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContentOutcome` ADD CONSTRAINT `ContentOutcome_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentOutcome` ADD CONSTRAINT `ContentOutcome_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `AimGeneration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

