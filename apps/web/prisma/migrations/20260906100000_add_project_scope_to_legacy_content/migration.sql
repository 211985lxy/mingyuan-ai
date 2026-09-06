-- Task 3: add optional project scope to legacy account-level content records.
--
-- The five legacy models below used to be account-level only. They now gain a
-- nullable `projectId` (first pass) so historical rows stay valid while the
-- app layer starts scoping new writes to the bound project. This migration is
-- purely additive: no columns are dropped, no rows are backfilled, no existing
-- keys are altered. Deleting a ClientProject sets `projectId` to NULL so audit
-- evidence is preserved (mirrors `TopicSelection`/`Inspiration`).

ALTER TABLE `CompetitorAnalysis`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `CompetitorAnalysis_userId_projectId_createdAt_idx`
  ON `CompetitorAnalysis`(`userId`, `projectId`, `createdAt` DESC);

ALTER TABLE `CompetitorAnalysis`
  ADD CONSTRAINT `CompetitorAnalysis_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `WatchAccount`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `WatchAccount_userId_projectId_createdAt_idx`
  ON `WatchAccount`(`userId`, `projectId`, `createdAt` DESC);

ALTER TABLE `WatchAccount`
  ADD CONSTRAINT `WatchAccount_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VideoCopyExtraction`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `VideoCopyExtraction_userId_projectId_createdAt_idx`
  ON `VideoCopyExtraction`(`userId`, `projectId`, `createdAt` DESC);

ALTER TABLE `VideoCopyExtraction`
  ADD CONSTRAINT `VideoCopyExtraction_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ContentGenerationRun`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `ContentGenerationRun_userId_projectId_createdAt_idx`
  ON `ContentGenerationRun`(`userId`, `projectId`, `createdAt` DESC);

ALTER TABLE `ContentGenerationRun`
  ADD CONSTRAINT `ContentGenerationRun_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Script`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `Script_userId_projectId_createdAt_idx`
  ON `Script`(`userId`, `projectId`, `createdAt` DESC);

ALTER TABLE `Script`
  ADD CONSTRAINT `Script_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
