ALTER TABLE `VideoTask`
  ADD COLUMN `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `deliveryWarning` LONGTEXT NULL,
  ADD COLUMN `deliveryExpiresAt` DATETIME(3) NULL;

CREATE INDEX `VideoTask_userId_deliveryStatus_idx`
  ON `VideoTask`(`userId`, `deliveryStatus`);
