-- Additive: 发布预测增加指标字段（抖音不对外公开播放量，播放无信号时按点赞预测与对账）。
-- 幂等：检查 INFORMATION_SCHEMA 后再 ALTER。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PublishPrediction' AND COLUMN_NAME = 'metric');
SET @sql := IF(@col = 0,
  'ALTER TABLE `PublishPrediction` ADD COLUMN `metric` VARCHAR(16) NOT NULL DEFAULT ''views''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
