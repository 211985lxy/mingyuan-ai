-- Additive: explicit Feishu 小D media-transcription task state and idempotency record.
CREATE TABLE `MediaTranscriptionTask` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `externalMessageId` VARCHAR(191) NOT NULL,
    `externalChatId` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(800) NOT NULL,
    `platform` VARCHAR(40) NOT NULL,
    `sourceTitle` VARCHAR(500) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'processing',
    `executionModeSnapshot` VARCHAR(20) NOT NULL,
    `documentToken` VARCHAR(191) NULL,
    `documentUrl` VARCHAR(800) NULL,
    `errorCode` VARCHAR(40) NULL,
    `errorMessage` TEXT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MediaTranscriptionTask_externalMessageId_key`(`externalMessageId`),
    INDEX `MediaTranscriptionTask_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `MediaTranscriptionTask_projectId_createdAt_idx`(`projectId`, `createdAt` DESC),
    INDEX `MediaTranscriptionTask_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `MediaTranscriptionTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `MediaTranscriptionTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
