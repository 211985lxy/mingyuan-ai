-- Additive: VideoStructure extraction fields (批量文案结构提取)
-- origin: canonical (seeded) | extracted (LLM-derived from pasted scripts)
-- sourceScriptText: original scripts joined by delimiter, for traceability
-- sourceScriptsCount: how many scripts were analysed to produce this structure
-- userId / projectId: ownership & scope of extracted structures (null for canonical)
ALTER TABLE `VideoStructure`
  ADD COLUMN `origin` VARCHAR(16) NOT NULL DEFAULT 'canonical',
  ADD COLUMN `sourceScriptText` LONGTEXT NULL,
  ADD COLUMN `sourceScriptsCount` INT NOT NULL DEFAULT 1,
  ADD COLUMN `userId` VARCHAR(191) NULL,
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `VideoStructure_origin_status_idx` ON `VideoStructure`(`origin`, `status`);
CREATE INDEX `VideoStructure_userId_createdAt_idx` ON `VideoStructure`(`userId`, `createdAt`);
