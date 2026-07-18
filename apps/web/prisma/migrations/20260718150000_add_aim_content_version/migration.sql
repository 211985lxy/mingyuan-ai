-- Immutable content versions for the work editor.
CREATE TABLE `AimContentVersion` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `format` VARCHAR(40) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `versionNo` INTEGER NOT NULL,
    `source` VARCHAR(24) NOT NULL,
    `parentVersionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AimContentVersion_userId_createdAt_idx`(`userId`, `createdAt` DESC),
    INDEX `AimContentVersion_generationId_versionNo_idx`(`generationId`, `versionNo`),
    INDEX `AimContentVersion_conversationId_versionNo_idx`(`conversationId`, `versionNo`),
    INDEX `AimContentVersion_parentVersionId_idx`(`parentVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AimContentVersion`
  ADD CONSTRAINT `AimContentVersion_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
