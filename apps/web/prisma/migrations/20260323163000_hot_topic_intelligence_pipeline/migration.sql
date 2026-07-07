ALTER TABLE `ContentGenerationRun`
  ADD COLUMN `hotTopicFit` JSON NULL,
  ADD COLUMN `hotTopicId` VARCHAR(191) NULL,
  ADD COLUMN `hotTopicInsight` JSON NULL;

ALTER TABLE `DouyinHotItem`
  ADD COLUMN `insightError` TEXT NULL,
  ADD COLUMN `insightJson` JSON NULL,
  ADD COLUMN `insightStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `insightUpdatedAt` DATETIME(3) NULL,
  ADD COLUMN `searchSnapshot` JSON NULL;

CREATE INDEX `ContentGenerationRun_hotTopicId_idx`
  ON `ContentGenerationRun`(`hotTopicId`);

CREATE INDEX `DouyinHotItem_sentenceId_fetchedAt_idx`
  ON `DouyinHotItem`(`sentenceId`, `fetchedAt`);
