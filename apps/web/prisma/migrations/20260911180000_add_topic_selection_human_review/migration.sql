-- Additive: 选题人工判断字段（选题定生死：AI 提案，人裁决）。
-- 幂等：逐列/逐索引检查 INFORMATION_SCHEMA 后再 ALTER，可重复执行。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'reviewStatus');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `reviewStatus` VARCHAR(20) NOT NULL DEFAULT ''pending''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'reviewedAt');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `reviewedAt` DATETIME(3) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'reviewedBy');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `reviewedBy` VARCHAR(128) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'reviewedVia');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `reviewedVia` VARCHAR(20) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'reviewNote');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `reviewNote` TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'pushedAt');
SET @sql := IF(@col = 0,
  'ALTER TABLE `TopicSelection` ADD COLUMN `pushedAt` DATETIME(3) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TopicSelection' AND INDEX_NAME = 'TopicSelection_userId_reviewStatus_idx');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `TopicSelection` ADD INDEX `TopicSelection_userId_reviewStatus_idx` (`userId`, `reviewStatus`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
