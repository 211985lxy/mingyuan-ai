-- CreateTable
CREATE TABLE `CompetitorAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetUrl` VARCHAR(500) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `platformUserId` VARCHAR(200) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `currentStep` VARCHAR(20) NULL,
    `errorMessage` TEXT NULL,
    `rawAccountData` JSON NULL,
    `rawVideoData` JSON NULL,
    `rawCommentData` JSON NULL,
    `metricsData` JSON NULL,
    `analysisResult` JSON NULL,
    `overallScore` INTEGER NULL,
    `accountName` VARCHAR(100) NULL,
    `accountAvatar` VARCHAR(500) NULL,
    `followerCount` INTEGER NULL,
    `videoCount` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `apiCostUsd` DOUBLE NULL DEFAULT 0,

    INDEX `CompetitorAnalysis_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `CompetitorAnalysis_userId_platform_idx`(`userId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CompetitorAnalysis` ADD CONSTRAINT `CompetitorAnalysis_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
