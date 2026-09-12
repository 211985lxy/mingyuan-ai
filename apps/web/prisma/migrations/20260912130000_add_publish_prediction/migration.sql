-- Additive: 发布前预测与对账（WP-A3 预测 vs 实际）。
-- 发布登记时落预测；效果回流后对账回填 verdict；系统性偏差生成学习候选（仍需人批）。

CREATE TABLE `PublishPrediction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `generationId` VARCHAR(30) NOT NULL,
    `windowDay` INTEGER NOT NULL,
    `predictedLow` INTEGER NOT NULL,
    `predictedHigh` INTEGER NOT NULL,
    `confidence` VARCHAR(16) NOT NULL,
    `rationaleDigest` TEXT NULL,
    `baselineHash` VARCHAR(64) NULL,
    `verdict` VARCHAR(16) NULL,
    `deviationRatio` DECIMAL(10, 4) NULL,
    `actualViews` INTEGER NULL,
    `reconciledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublishPrediction_generationId_windowDay_key`(`generationId`, `windowDay`),
    INDEX `PublishPrediction_userId_reconciledAt_idx`(`userId`, `reconciledAt`),
    INDEX `PublishPrediction_projectId_windowDay_idx`(`projectId`, `windowDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
