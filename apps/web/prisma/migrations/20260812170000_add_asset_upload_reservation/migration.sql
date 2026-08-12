-- Additive: OSS direct-upload reservations with bound size/key/content-type.
CREATE TABLE IF NOT EXISTS `AssetUploadReservation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `objectKey` VARCHAR(191) NOT NULL,
  `declaredSizeBytes` INT NOT NULL,
  `contentType` VARCHAR(191) NOT NULL,
  `assetType` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `assetUrl` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `AssetUploadReservation_userId_status_idx` (`userId`, `status`),
  INDEX `AssetUploadReservation_expiresAt_idx` (`expiresAt`),
  INDEX `AssetUploadReservation_objectKey_idx` (`objectKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AssetUploadReservation`
  ADD CONSTRAINT `AssetUploadReservation_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
