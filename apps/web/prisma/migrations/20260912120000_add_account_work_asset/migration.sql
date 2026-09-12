-- Additive: 账号历史作品资产投影（WP-A1 账号接入即全量初始化）。
-- 正本仍在飞书 Base；本表只服务"历史作品成为智能体全局上下文"。

CREATE TABLE `AccountWorkAsset` (
    `id` VARCHAR(191) NOT NULL,
    `bindingId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `platform` VARCHAR(40) NOT NULL,
    `externalWorkId` VARCHAR(64) NOT NULL,
    `title` TEXT NOT NULL,
    `coverUrl` TEXT NULL,
    `publishedAt` DATETIME(3) NULL,
    `stats` JSON NOT NULL,
    `transcript` MEDIUMTEXT NULL,
    `transcriptStatus` VARCHAR(20) NOT NULL DEFAULT 'none',
    `transcriptAttempts` INTEGER NOT NULL DEFAULT 0,
    `lastSyncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccountWorkAsset_bindingId_externalWorkId_key`(`bindingId`, `externalWorkId`),
    INDEX `AccountWorkAsset_projectId_publishedAt_idx`(`projectId`, `publishedAt`),
    INDEX `AccountWorkAsset_transcriptStatus_idx`(`transcriptStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
