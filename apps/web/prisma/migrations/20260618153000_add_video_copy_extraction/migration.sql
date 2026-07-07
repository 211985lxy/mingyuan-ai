CREATE TABLE `VideoCopyExtraction` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sourceUrl` VARCHAR(800) NOT NULL,
  `platform` VARCHAR(40) NOT NULL DEFAULT 'unknown',
  `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
  `errorMessage` TEXT NULL,
  `analysisError` TEXT NULL,
  `providerBatchId` VARCHAR(120) NULL,
  `providerTaskId` VARCHAR(120) NULL,
  `videoTitle` VARCHAR(500) NULL,
  `videoCover` VARCHAR(800) NULL,
  `videoDuration` VARCHAR(40) NULL,
  `transcript` LONGTEXT NULL,
  `analysisResult` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  INDEX `VideoCopyExtraction_userId_createdAt_idx`(`userId`, `createdAt` DESC),
  INDEX `VideoCopyExtraction_userId_status_idx`(`userId`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoCopyExtraction`
  ADD CONSTRAINT `VideoCopyExtraction_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
