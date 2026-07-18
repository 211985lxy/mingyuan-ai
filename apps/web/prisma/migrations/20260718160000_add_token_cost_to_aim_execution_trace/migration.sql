ALTER TABLE `AimExecutionTrace`
  ADD COLUMN `inputTokens` INTEGER NULL,
  ADD COLUMN `outputTokens` INTEGER NULL,
  ADD COLUMN `cachedTokens` INTEGER NULL,
  ADD COLUMN `costCny` DECIMAL(10,6) NULL;
