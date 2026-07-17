-- Forward repair for production drift after the retired-media migration.
-- Fresh databases already dropped this column in 20260714120000_retire_video_generation,
-- so the repair must also be safe when the column is absent.

SET @auth_video_column_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'User'
    AND `COLUMN_NAME` = 'authVideoUrl'
);

SET @drop_auth_video_column_sql = IF(
  @auth_video_column_exists > 0,
  'ALTER TABLE `User` DROP COLUMN `authVideoUrl`',
  'SELECT 1'
);

PREPARE drop_auth_video_column_statement FROM @drop_auth_video_column_sql;
EXECUTE drop_auth_video_column_statement;
DEALLOCATE PREPARE drop_auth_video_column_statement;
