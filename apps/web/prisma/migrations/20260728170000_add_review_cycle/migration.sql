-- WP-5: ReviewCycle + ReviewAction
CREATE TABLE IF NOT EXISTS `ReviewCycle` (
    `id` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `metricsSnapshot` JSON NOT NULL,
    `systemOwnerId` VARCHAR(191) NOT NULL,
    `filterSnapshot` JSON NULL,
    `signedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReviewCycle_periodStart_periodEnd_idx`(`periodStart`, `periodEnd`),
    INDEX `ReviewCycle_status_idx`(`status`),
    INDEX `ReviewCycle_systemOwnerId_idx`(`systemOwnerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ReviewAction` (
    `id` VARCHAR(191) NOT NULL,
    `reviewCycleId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',
    `evidenceRef` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReviewAction_reviewCycleId_status_idx`(`reviewCycleId`, `status`),
    INDEX `ReviewAction_ownerId_status_idx`(`ownerId`, `status`),
    INDEX `ReviewAction_dueAt_idx`(`dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ReviewAction`
  ADD CONSTRAINT `ReviewAction_reviewCycleId_fkey`
  FOREIGN KEY (`reviewCycleId`) REFERENCES `ReviewCycle`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
