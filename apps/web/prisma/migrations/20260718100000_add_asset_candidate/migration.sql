-- CreateTable：会后资产候选（90 天计划 3.1）
CREATE TABLE `AssetCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `feishuRecordId` VARCHAR(64) NULL,
    `kind` VARCHAR(40) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `evidence` TEXT NULL,
    `confidence` VARCHAR(10) NOT NULL DEFAULT 'medium',
    `reviewStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `crossProjectAllowed` BOOLEAN NOT NULL DEFAULT false,
    `promotedEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AssetCandidate_userId_reviewStatus_idx`(`userId`, `reviewStatus`),
    INDEX `AssetCandidate_userId_projectId_kind_idx`(`userId`, `projectId`, `kind`),
    INDEX `AssetCandidate_generationId_idx`(`generationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AssetCandidate` ADD CONSTRAINT `AssetCandidate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetCandidate` ADD CONSTRAINT `AssetCandidate_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
