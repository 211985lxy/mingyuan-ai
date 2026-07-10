-- Baseline for AimExecutionTrace.
-- Existing production databases created this table before it entered migration
-- history. Mark this migration applied there before running migrate deploy.
-- Clean databases execute it normally so the following harness migration can
-- safely add its telemetry columns.
CREATE TABLE `AimExecutionTrace` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `durationMs` INTEGER NULL,
    `model` VARCHAR(191) NULL,
    `totalTokens` INTEGER NULL,
    `inputSummary` TEXT NULL,
    `outputSummary` TEXT NULL,
    `errorMessage` TEXT NULL,
    `steps` JSON NOT NULL DEFAULT (JSON_ARRAY()),
    `aimGenerationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AimExecutionTrace_createdAt_idx`(`createdAt` DESC),
    INDEX `AimExecutionTrace_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimExecutionTrace_agentId_createdAt_idx`(`agentId`, `createdAt` DESC),
    INDEX `AimExecutionTrace_status_createdAt_idx`(`status`, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AimExecutionTrace`
  ADD CONSTRAINT `AimExecutionTrace_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
