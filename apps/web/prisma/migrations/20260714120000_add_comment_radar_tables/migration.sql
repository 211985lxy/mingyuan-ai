-- CreateTable: CommentInsightJob
CREATE TABLE `CommentInsightJob` (
    `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `sourceUrl` TEXT NOT NULL,
    `platform` VARCHAR(191) NOT NULL, `sourceType` VARCHAR(191) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `videoLimit` INTEGER NOT NULL DEFAULT 20, `totalItems` INTEGER NOT NULL DEFAULT 0, `processedItems` INTEGER NOT NULL DEFAULT 0,
    `failedItems` INTEGER NOT NULL DEFAULT 0, `reportedCommentCount` INTEGER NOT NULL DEFAULT 0, `collectedCommentCount` INTEGER NOT NULL DEFAULT 0,
    `analyzedSampleCount` INTEGER NOT NULL DEFAULT 0, `analysisResult` JSON NULL, `partialReason` TEXT NULL, `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL, `completedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CommentSourceItem
CREATE TABLE `CommentSourceItem` (
    `id` VARCHAR(191) NOT NULL, `jobId` VARCHAR(191) NOT NULL, `platformItemId` VARCHAR(191) NOT NULL,
    `sourceUrl` TEXT NOT NULL, `title` VARCHAR(191) NOT NULL DEFAULT '', `reportedCommentCount` INTEGER NOT NULL DEFAULT 0,
    `cursor` VARCHAR(191) NOT NULL DEFAULT '', `hasMore` BOOLEAN NOT NULL DEFAULT TRUE,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending', `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: CommentRecord
CREATE TABLE `CommentRecord` (
    `id` VARCHAR(191) NOT NULL, `jobId` VARCHAR(191) NOT NULL, `sourceItemId` VARCHAR(191) NOT NULL,
    `platformCommentId` VARCHAR(191) NOT NULL, `text` TEXT NOT NULL, `nickname` VARCHAR(255) NULL,
    `likes` INTEGER NOT NULL DEFAULT 0, `createTime` VARCHAR(191) NOT NULL DEFAULT '', `isTop` BOOLEAN NOT NULL DEFAULT FALSE,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CommentInsightJob` ADD CONSTRAINT `CommentInsightJob_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CommentSourceItem` ADD CONSTRAINT `CommentSourceItem_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `CommentInsightJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CommentRecord` ADD CONSTRAINT `CommentRecord_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `CommentInsightJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CommentRecord` ADD CONSTRAINT `CommentRecord_sourceItemId_fkey` FOREIGN KEY (`sourceItemId`) REFERENCES `CommentSourceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX `CommentInsightJob_userId_createdAt_idx` ON `CommentInsightJob`(`userId`, `createdAt` DESC);
CREATE INDEX `CommentInsightJob_userId_status_idx` ON `CommentInsightJob`(`userId`, `status`);
CREATE UNIQUE INDEX `CommentSourceItem_jobId_platformItemId_key` ON `CommentSourceItem`(`jobId`, `platformItemId`);
CREATE UNIQUE INDEX `CommentRecord_jobId_platformCommentId_key` ON `CommentRecord`(`jobId`, `platformCommentId`);
CREATE INDEX `CommentRecord_jobId_likes_idx` ON `CommentRecord`(`jobId`, `likes` DESC);
CREATE INDEX `CommentRecord_sourceItemId_createdAt_idx` ON `CommentRecord`(`sourceItemId`, `createdAt` DESC);
