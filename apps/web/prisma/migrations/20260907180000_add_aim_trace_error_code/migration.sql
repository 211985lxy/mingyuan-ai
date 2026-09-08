-- Additive: searchable failure code on AIM traces. No backfill of customer text.
ALTER TABLE `AimExecutionTrace`
  ADD COLUMN `errorCode` VARCHAR(48) NULL;

CREATE INDEX `AimExecutionTrace_errorCode_idx`
  ON `AimExecutionTrace`(`errorCode`);
