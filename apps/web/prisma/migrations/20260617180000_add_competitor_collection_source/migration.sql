ALTER TABLE `CompetitorAnalysis`
  ADD COLUMN `collectionSource` VARCHAR(40) NULL,
  ADD COLUMN `fallbackUsed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `fallbackReason` TEXT NULL;
