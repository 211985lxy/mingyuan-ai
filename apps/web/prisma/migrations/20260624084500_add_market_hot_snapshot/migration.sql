CREATE TABLE `MarketHotSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `date` VARCHAR(191) NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `items` JSON NOT NULL,
  `warnings` JSON NOT NULL,
  `summary` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'success',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `MarketHotSnapshot_date_key`(`date`),
  INDEX `MarketHotSnapshot_generatedAt_idx`(`generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
