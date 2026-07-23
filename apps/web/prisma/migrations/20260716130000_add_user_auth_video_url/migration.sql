-- Temporary re-add for environments that still needed the column after
-- 20260714120000_retire_video_generation. MySQL 8 does not support
-- `ADD COLUMN IF NOT EXISTS`, so use information_schema + prepared SQL.
-- 20260717160000_finish_retired_auth_video_column drops it again safely.

SET @auth_video_column_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'User'
    AND `COLUMN_NAME` = 'authVideoUrl'
);

SET @add_auth_video_column_sql = IF(
  @auth_video_column_exists = 0,
  'ALTER TABLE `User` ADD COLUMN `authVideoUrl` VARCHAR(191) NULL',
  'SELECT 1'
);

PREPARE add_auth_video_column_statement FROM @add_auth_video_column_sql;
EXECUTE add_auth_video_column_statement;
DEALLOCATE PREPARE add_auth_video_column_statement;
