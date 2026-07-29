-- Additive: AssetCandidate.promotedAt（首次晋升时间；历史缺失保持 NULL，不回填）
ALTER TABLE `AssetCandidate`
  ADD COLUMN `promotedAt` DATETIME(3) NULL;

CREATE INDEX `AssetCandidate_promotedAt_idx` ON `AssetCandidate`(`promotedAt`);
