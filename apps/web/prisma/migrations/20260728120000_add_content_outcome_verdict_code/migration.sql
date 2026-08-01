-- AlterTable (MySQL-compatible idempotency; MySQL does not support ADD COLUMN IF NOT EXISTS.)
SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ContentOutcome'
    AND COLUMN_NAME = 'verdictCode'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE `ContentOutcome` ADD COLUMN `verdictCode` VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
