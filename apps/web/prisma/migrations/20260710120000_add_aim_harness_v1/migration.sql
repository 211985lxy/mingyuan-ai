-- AIM Thin Harness v1: additive telemetry + run snapshots.
-- 纯增量：为 AimExecutionTrace 增加 long-term 可观测字段，并新建 AimRunSnapshot。
-- AimExecutionTrace 由前一条 baseline migration 纳入迁移历史；已有该表的
-- 环境须先将 baseline 标记为 applied。所有新列均为 nullable，保证旧行兼容。
ALTER TABLE `AimExecutionTrace`
  ADD COLUMN `runId` VARCHAR(40) NULL,
  ADD COLUMN `provider` VARCHAR(64) NULL,
  ADD COLUMN `fallbackIndex` INTEGER NULL,
  ADD COLUMN `degraded` BOOLEAN NULL,
  ADD COLUMN `harnessVersion` VARCHAR(40) NULL,
  ADD COLUMN `runtimeTask` VARCHAR(32) NULL,
  ADD COLUMN `conversationMode` VARCHAR(32) NULL,
  ADD COLUMN `knowledgeStrategy` VARCHAR(32) NULL,
  ADD COLUMN `promptHash` VARCHAR(64) NULL,
  ADD COLUMN `contextHash` VARCHAR(64) NULL,
  ADD COLUMN `qualityStatus` VARCHAR(24) NULL,
  ADD COLUMN `snapshotId` VARCHAR(40) NULL;

CREATE INDEX `AimExecutionTrace_runId_idx` ON `AimExecutionTrace`(`runId`);
CREATE INDEX `AimExecutionTrace_promptHash_idx` ON `AimExecutionTrace`(`promptHash`);
CREATE INDEX `AimExecutionTrace_qualityStatus_idx` ON `AimExecutionTrace`(`qualityStatus`);

-- 完整运行快照：保存 runSpec、上下文清单、provider 尝试、完整文本 prompt、
-- 输出、质量结果、哈希与 expiresAt。仅管理员可见，30 天由 cron/cleanup 删除；
-- 图片只存哈希与类型，不存 base64 / 临时签名地址。
CREATE TABLE `AimRunSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(40) NOT NULL,
    `traceId` VARCHAR(40) NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `action` VARCHAR(32) NULL,
    `runSpec` JSON NOT NULL DEFAULT (JSON_OBJECT()),
    `contextManifest` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `providerAttempts` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `fullPrompt` MEDIUMTEXT NULL,
    `promptMessages` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `promptHash` VARCHAR(64) NULL,
    `contextHash` VARCHAR(64) NULL,
    `output` MEDIUMTEXT NULL,
    `outputFormats` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `qualityResult` JSON NULL,
    `imageHashes` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `provider` VARCHAR(64) NULL,
    `model` VARCHAR(64) NULL,
    `fallbackIndex` INTEGER NULL,
    `degraded` BOOLEAN NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AimRunSnapshot_runId_key`(`runId`),
    INDEX `AimRunSnapshot_expiresAt_idx`(`expiresAt`),
    INDEX `AimRunSnapshot_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimRunSnapshot_agentId_createdAt_idx`(`agentId`, `createdAt` DESC),
    INDEX `AimRunSnapshot_traceId_idx`(`traceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey (userId -> User)，ON DELETE SET NULL，快照不强约束用户存在
ALTER TABLE `AimRunSnapshot` ADD CONSTRAINT `AimRunSnapshot_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
