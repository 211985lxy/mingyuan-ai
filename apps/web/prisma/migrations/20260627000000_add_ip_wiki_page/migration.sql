-- CreateTable
CREATE TABLE `IpWikiPage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `pageType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `frontmatter` JSON NOT NULL,
    `sources` JSON NOT NULL,
    `links` JSON NOT NULL,
    `sourceGenerationId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IpWikiPage_projectId_status_idx`(`projectId`, `status`),
    INDEX `IpWikiPage_projectId_pageType_status_idx`(`projectId`, `pageType`, `status`),
    INDEX `IpWikiPage_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `IpWikiPage` ADD CONSTRAINT `IpWikiPage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IpWikiPage` ADD CONSTRAINT `IpWikiPage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
