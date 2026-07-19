-- Repair production drift where the prior completed retirement migration did
-- not leave the retired authVideoUrl column absent. Fresh databases already
-- have no such column, so this remains safe for the normal migration chain.
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
