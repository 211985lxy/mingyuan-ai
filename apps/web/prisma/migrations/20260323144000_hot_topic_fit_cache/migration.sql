CREATE TABLE `HotTopicFitCache` (
  `id` VARCHAR(191) NOT NULL,
  `cacheKey` VARCHAR(191) NOT NULL,
  `topicId` VARCHAR(191) NOT NULL,
  `topicTitle` VARCHAR(191) NOT NULL,
  `templateId` VARCHAR(191) NOT NULL,
  `structureId` VARCHAR(191) NOT NULL,
  `ipProfileId` VARCHAR(191) NOT NULL,
  `fitJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `HotTopicFitCache_cacheKey_key`(`cacheKey`),
  INDEX `HotTopicFitCache_topicId_templateId_structureId_idx`(`topicId`, `templateId`, `structureId`),
  INDEX `HotTopicFitCache_ipProfileId_updatedAt_idx`(`ipProfileId`, `updatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
