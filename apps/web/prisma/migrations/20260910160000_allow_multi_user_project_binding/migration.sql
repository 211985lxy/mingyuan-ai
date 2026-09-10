-- Additive: 允许多个账号共绑同一项目（团队场景）——唯一索引降级为普通索引。
-- 注意：boundProjectId 带外键，必须先建普通索引再删唯一索引（MySQL 要求 FK 列恒有索引）。

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND INDEX_NAME = 'User_boundProjectId_idx');
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE `User` ADD INDEX `User_boundProjectId_idx` (`boundProjectId`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND INDEX_NAME = 'User_boundProjectId_key');
SET @sql := IF(@uk_exists > 0,
  'ALTER TABLE `User` DROP INDEX `User_boundProjectId_key`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
