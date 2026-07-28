-- CreateTable
CREATE TABLE IF NOT EXISTS `TaskEfficiencyBaseline` (
    `id` VARCHAR(191) NOT NULL,
    `workflowId` VARCHAR(80) NOT NULL,
    `taskType` VARCHAR(80) NOT NULL,
    `medianManualMinutes` DOUBLE NOT NULL,
    `sampleSize` INTEGER NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `approvedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskEfficiencyBaseline_workflowId_taskType_idx`(`workflowId`, `taskType`),
    INDEX `TaskEfficiencyBaseline_validFrom_idx`(`validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
