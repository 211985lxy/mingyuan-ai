-- Add provider column to PexelsMedia (default "pexels" for existing rows)
ALTER TABLE `PexelsMedia` ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'pexels';

-- Drop the old unique index on pexelsId alone
DROP INDEX `PexelsMedia_pexelsId_key` ON `PexelsMedia`;

-- Add compound unique constraint (provider + pexelsId)
CREATE UNIQUE INDEX `PexelsMedia_provider_pexelsId_key` ON `PexelsMedia`(`provider`, `pexelsId`);

-- Add provider index
CREATE INDEX `PexelsMedia_provider_idx` ON `PexelsMedia`(`provider`);

-- Add provider column to PexelsQueryCache
ALTER TABLE `PexelsQueryCache` ADD COLUMN `provider` VARCHAR(191) NOT NULL DEFAULT 'pexels';

-- Add provider index
CREATE INDEX `PexelsQueryCache_provider_idx` ON `PexelsQueryCache`(`provider`);
