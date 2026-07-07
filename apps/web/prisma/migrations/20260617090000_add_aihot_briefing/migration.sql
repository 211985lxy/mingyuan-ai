CREATE TABLE `AiHotBriefing` (
  `id` VARCHAR(191) NOT NULL,
  `date` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `windowStart` DATETIME(3) NOT NULL,
  `windowEnd` DATETIME(3) NOT NULL,
  `markdown` TEXT NOT NULL,
  `items` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `AiHotBriefing_date_key`(`date`),
  INDEX `AiHotBriefing_generatedAt_idx`(`generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
