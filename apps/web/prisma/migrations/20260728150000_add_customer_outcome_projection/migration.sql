-- CreateTable
CREATE TABLE IF NOT EXISTS `CustomerOutcomeProjection` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `externalOutcomeId` VARCHAR(80) NOT NULL,
    `externalDealId` VARCHAR(80) NULL,
    `metricCode` VARCHAR(80) NOT NULL,
    `baseline` DECIMAL(14, 2) NULL,
    `target` DECIMAL(14, 2) NULL,
    `actual` DECIMAL(14, 2) NULL,
    `unit` VARCHAR(40) NULL,
    `observedFrom` DATETIME(3) NOT NULL,
    `observedTo` DATETIME(3) NOT NULL,
    `evidenceRef` VARCHAR(500) NOT NULL,
    `reviewStatus` VARCHAR(20) NOT NULL,
    `reviewerRef` VARCHAR(120) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CustomerOutcomeProjection_externalOutcomeId_key`(`externalOutcomeId`),
    INDEX `CustomerOutcomeProjection_projectId_reviewStatus_idx`(`projectId`, `reviewStatus`),
    INDEX `CustomerOutcomeProjection_externalDealId_idx`(`externalDealId`),
    INDEX `CustomerOutcomeProjection_metricCode_idx`(`metricCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerOutcomeProjection` ADD CONSTRAINT `CustomerOutcomeProjection_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
