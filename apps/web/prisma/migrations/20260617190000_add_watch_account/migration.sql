-- CreateTable
CREATE TABLE `WatchAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `targetUrl` VARCHAR(500) NOT NULL,
    `platform` VARCHAR(20) NOT NULL DEFAULT 'douyin',
    `platformUserId` VARCHAR(200) NULL,
    `nickname` VARCHAR(100) NULL,
    `avatar` VARCHAR(500) NULL,
    `followerCount` INTEGER NULL,
    `latestVideos` JSON NULL,
    `viralVideos` JSON NULL,
    `refreshStatus` VARCHAR(20) NOT NULL DEFAULT 'idle',
    `refreshError` TEXT NULL,
    `lastRefreshedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WatchAccount_targetUrl_key`(`targetUrl`),
    INDEX `WatchAccount_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WatchAccount` ADD CONSTRAINT `WatchAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
