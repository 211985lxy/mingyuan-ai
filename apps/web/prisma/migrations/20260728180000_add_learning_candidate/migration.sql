-- WP-6: LearningCandidate（候选不得自动写正式知识）
CREATE TABLE IF NOT EXISTS `LearningCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(40) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `generationId` VARCHAR(191) NULL,
    `targetType` VARCHAR(40) NOT NULL,
    `failureCode` VARCHAR(80) NULL,
    `payload` JSON NOT NULL,
    `reviewStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `reviewerId` VARCHAR(191) NULL,
    `promotedRef` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LearningCandidate_requestId_key`(`requestId`),
    INDEX `LearningCandidate_reviewStatus_createdAt_idx`(`reviewStatus`, `createdAt`),
    INDEX `LearningCandidate_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    INDEX `LearningCandidate_targetType_reviewStatus_idx`(`targetType`, `reviewStatus`),
    INDEX `LearningCandidate_projectId_idx`(`projectId`),
    INDEX `LearningCandidate_generationId_idx`(`generationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
