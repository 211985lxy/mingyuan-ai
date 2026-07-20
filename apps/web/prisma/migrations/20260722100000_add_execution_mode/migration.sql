-- Add executionMode to ChannelBinding and executionModeSnapshot to Inspiration.
-- Idempotent: uses information_schema checks so it is safe to re-run.

SET @cb_mode_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'ChannelBinding'
    AND `COLUMN_NAME` = 'executionMode'
);

SET @alter_cb_sql = IF(
  @cb_mode_exists = 0,
  'ALTER TABLE `ChannelBinding` ADD COLUMN `executionMode` VARCHAR(20) NOT NULL DEFAULT ''live'' AFTER `triggerKeywords`',
  'SELECT 1'
);

PREPARE alter_cb_stmt FROM @alter_cb_sql;
EXECUTE alter_cb_stmt;
DEALLOCATE PREPARE alter_cb_stmt;

SET @ins_mode_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'Inspiration'
    AND `COLUMN_NAME` = 'executionModeSnapshot'
);

SET @alter_ins_sql = IF(
  @ins_mode_exists = 0,
  'ALTER TABLE `Inspiration` ADD COLUMN `executionModeSnapshot` VARCHAR(20) NULL AFTER `repliedAt`',
  'SELECT 1'
);

PREPARE alter_ins_stmt FROM @alter_ins_sql;
EXECUTE alter_ins_stmt;
DEALLOCATE PREPARE alter_ins_stmt;

SET @ins_idx_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'Inspiration'
    AND `INDEX_NAME` = 'Inspiration_executionModeSnapshot_idx'
);

SET @create_ins_idx_sql = IF(
  @ins_idx_exists = 0,
  'CREATE INDEX `Inspiration_executionModeSnapshot_idx` ON `Inspiration`(`executionModeSnapshot`)',
  'SELECT 1'
);

PREPARE create_ins_idx_stmt FROM @create_ins_idx_sql;
EXECUTE create_ins_idx_stmt;
DEALLOCATE PREPARE create_ins_idx_stmt;
