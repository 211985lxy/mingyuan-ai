-- Add token-usage and cost columns to AimExecutionTrace so streaming/non-streaming
-- runs can be metered for cost. inputTokens/outputTokens/cachedTokens come from the
-- successful provider attempt; costCny is derived via model-pricing.ts.
ALTER TABLE `AimExecutionTrace`
  ADD COLUMN `inputTokens` INTEGER NULL,
  ADD COLUMN `outputTokens` INTEGER NULL,
  ADD COLUMN `cachedTokens` INTEGER NULL,
  ADD COLUMN `costCny` DECIMAL(10,6) NULL;
