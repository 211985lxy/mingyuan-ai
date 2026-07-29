-- WP-1: additive structured outcome telemetry.
-- Existing rows remain NULL/unknown; no historical values are inferred.
ALTER TABLE `AimRunEvent`
  ADD COLUMN `workflowId` VARCHAR(80) NULL,
  ADD COLUMN `taskType` VARCHAR(80) NULL,
  ADD COLUMN `finalDisposition` VARCHAR(32) NULL,
  ADD COLUMN `humanActiveMinutes` DOUBLE NULL,
  ADD COLUMN `manualBaselineMinutes` DOUBLE NULL,
  ADD COLUMN `reasonCode` VARCHAR(64) NULL,
  ADD COLUMN `channel` VARCHAR(16) NULL,
  ADD COLUMN `requestId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `AimRunEvent_userId_runId_requestId_key`
  ON `AimRunEvent`(`userId`, `runId`, `requestId`);
CREATE INDEX `AimRunEvent_workflowId_taskType_createdAt_idx`
  ON `AimRunEvent`(`workflowId`, `taskType`, `createdAt` DESC);
CREATE INDEX `AimRunEvent_channel_createdAt_idx`
  ON `AimRunEvent`(`channel`, `createdAt` DESC);

CREATE UNIQUE INDEX `TaskEfficiencyBaseline_workflowId_taskType_validFrom_key`
  ON `TaskEfficiencyBaseline`(`workflowId`, `taskType`, `validFrom`);
