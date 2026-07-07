ALTER TABLE `PexelsMedia`
  ADD COLUMN `provider` varchar(191) NOT NULL DEFAULT 'pexels' AFTER `id`;

ALTER TABLE `PexelsMedia`
  DROP INDEX `PexelsMedia_pexelsId_key`;

CREATE UNIQUE INDEX `PexelsMedia_provider_pexelsId_key`
  ON `PexelsMedia`(`provider`, `pexelsId`);

CREATE INDEX `PexelsMedia_provider_idx`
  ON `PexelsMedia`(`provider`);

ALTER TABLE `PexelsQueryCache`
  ADD COLUMN `provider` varchar(191) NOT NULL DEFAULT 'pexels' AFTER `id`;

CREATE INDEX `PexelsQueryCache_provider_idx`
  ON `PexelsQueryCache`(`provider`);
