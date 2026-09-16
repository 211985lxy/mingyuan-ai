-- Additive: 视频任务增加多产物清单（一次渲染出三比例时，`videoUrl` 只够存首选那条）。
-- 幂等：检查 INFORMATION_SCHEMA 后再 ALTER，可重复运行。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'renderOutputs');
SET @sql := IF(@col = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `renderOutputs` JSON NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
