ALTER TABLE `AimGeneration`
  ADD COLUMN `publishPlatform` VARCHAR(191) NULL,
  ADD COLUMN `publishUrl` TEXT NULL,
  ADD COLUMN `decisionSnapshot` JSON NULL,
  ADD COLUMN `retroSnapshots` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  ADD COLUMN `calibrationRules` JSON NOT NULL DEFAULT (JSON_ARRAY());
