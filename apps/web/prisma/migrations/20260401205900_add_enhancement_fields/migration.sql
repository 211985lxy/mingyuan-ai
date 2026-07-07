-- AlterTable
ALTER TABLE `VideoTask` ADD COLUMN `enhancementStatus` VARCHAR(191) NULL,
    ADD COLUMN `enhancementJobId` VARCHAR(191) NULL,
    ADD COLUMN `enhanced4kUrl` VARCHAR(191) NULL,
    ADD COLUMN `enhanced4kCoverUrl` VARCHAR(191) NULL,
    ADD COLUMN `enhanced4kDuration` INTEGER NULL,
    ADD COLUMN `enhancementErrorCode` VARCHAR(191) NULL,
    ADD COLUMN `enhancementErrorMessage` TEXT NULL,
    ADD COLUMN `enhancementStartedAt` DATETIME(3) NULL,
    ADD COLUMN `enhancementCompletedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `VideoTask_enhancementJobId_key` ON `VideoTask`(`enhancementJobId`);

-- CreateIndex
CREATE INDEX `VideoTask_enhancementStatus_updatedAt_idx` ON `VideoTask`(`enhancementStatus`, `updatedAt`);
