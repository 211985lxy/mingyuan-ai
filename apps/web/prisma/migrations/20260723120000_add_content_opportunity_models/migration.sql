CREATE TABLE IF NOT EXISTS `OpportunitySearchRun` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `platforms` JSON NOT NULL,
    `filters` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `platformStatus` JSON NULL,
    `resultCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `OpportunitySearchRun_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `OpportunitySearchRun_keyword_idx`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OpportunityItemSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `searchRunId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(191) NULL,
    `title` TEXT NULL,
    `authorName` VARCHAR(191) NULL,
    `authorId` VARCHAR(191) NULL,
    `followerCount` INTEGER NULL,
    `publishedAt` DATETIME(3) NULL,
    `durationSeconds` INTEGER NULL,
    `views` INTEGER NULL,
    `likes` INTEGER NULL,
    `comments` INTEGER NULL,
    `shares` INTEGER NULL,
    `collects` INTEGER NULL,
    `opportunityScore` DOUBLE NULL,
    `scoreBreakdown` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `OpportunityItemSnapshot_searchRunId_idx`(`searchRunId`),
    INDEX `OpportunityItemSnapshot_platform_sourceId_idx`(`platform`, `sourceId`),
    UNIQUE INDEX `OpportunityItemSnapshot_searchRunId_platform_sourceId_key`(`searchRunId`, `platform`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OpportunityCollection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `items` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `analysisResult` JSON NULL,
    `analysisError` TEXT NULL,
    `backgroundTaskId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `OpportunityCollection_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `OpportunityCollection_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
