-- Additive: 抖音绑定增加作品数据通道所需的 sec_user_id / profileUrl（WP-A1）。
-- 背景：抖音开放平台「授权账号作品列表」能力已下线（实测错误码 28001056），
-- 改走第三方公开数据通道（TikHub 主 / 红狐备），二者均以 sec_user_id 定位账号。
-- 幂等：逐列检查 INFORMATION_SCHEMA 后再 ALTER，可重复执行。

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DouyinAccountBinding' AND COLUMN_NAME = 'secUserId');
SET @sql := IF(@col = 0,
  'ALTER TABLE `DouyinAccountBinding` ADD COLUMN `secUserId` VARCHAR(200) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DouyinAccountBinding' AND COLUMN_NAME = 'profileUrl');
SET @sql := IF(@col = 0,
  'ALTER TABLE `DouyinAccountBinding` ADD COLUMN `profileUrl` TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
