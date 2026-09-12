-- Add project lineage, provider ownership and idempotency to the restored
-- digital-human tables. Every DDL operation is guarded so a partially applied
-- migration can be safely replayed on MariaDB/MySQL.

SET @schema_name = DATABASE();

SELECT COUNT(*) INTO @has_user_auth_text
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'User' AND COLUMN_NAME = 'authVideoText';
SET @sql = IF(@has_user_auth_text = 0,
  'ALTER TABLE `User` ADD COLUMN `authVideoText` TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_user_auth_confirmed
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'User' AND COLUMN_NAME = 'authVideoConfirmedAt';
SET @sql = IF(@has_user_auth_confirmed = 0,
  'ALTER TABLE `User` ADD COLUMN `authVideoConfirmedAt` DATETIME(3) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_project_id
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND COLUMN_NAME = 'projectId';
SET @sql = IF(@has_avatar_project_id = 0,
  'ALTER TABLE `Avatar` ADD COLUMN `projectId` VARCHAR(191) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_provider
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND COLUMN_NAME = 'provider';
SET @sql = IF(@has_avatar_provider = 0,
  'ALTER TABLE `Avatar` ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT ''chanjing''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_auth_text
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND COLUMN_NAME = 'authorizationText';
SET @sql = IF(@has_avatar_auth_text = 0,
  'ALTER TABLE `Avatar` ADD COLUMN `authorizationText` TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_auth_confirmed
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND COLUMN_NAME = 'authorizationConfirmedAt';
SET @sql = IF(@has_avatar_auth_confirmed = 0,
  'ALTER TABLE `Avatar` ADD COLUMN `authorizationConfirmedAt` DATETIME(3) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_project_id
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'projectId';
SET @sql = IF(@has_video_project_id = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `projectId` VARCHAR(191) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_aim_generation_id
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'aimGenerationId';
SET @sql = IF(@has_video_aim_generation_id = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `aimGenerationId` VARCHAR(191) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_provider
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'provider';
SET @sql = IF(@has_video_provider = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT ''chanjing''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_idempotency
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'idempotencyKey';
SET @sql = IF(@has_video_idempotency = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_retry_of
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'retryOfTaskId';
SET @sql = IF(@has_video_retry_of = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `retryOfTaskId` VARCHAR(191) NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_attempts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND COLUMN_NAME = 'providerAttempts';
SET @sql = IF(@has_video_attempts = 0,
  'ALTER TABLE `VideoTask` ADD COLUMN `providerAttempts` JSON NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_project_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND INDEX_NAME = 'Avatar_userId_projectId_status_idx';
SET @sql = IF(@has_avatar_project_index = 0,
  'CREATE INDEX `Avatar_userId_projectId_status_idx` ON `Avatar` (`userId`, `projectId`, `status`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_provider_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar' AND INDEX_NAME = 'Avatar_provider_externalTaskId_idx';
SET @sql = IF(@has_avatar_provider_index = 0,
  'CREATE INDEX `Avatar_provider_externalTaskId_idx` ON `Avatar` (`provider`, `externalTaskId`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_project_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND INDEX_NAME = 'VideoTask_userId_projectId_status_idx';
SET @sql = IF(@has_video_project_index = 0,
  'CREATE INDEX `VideoTask_userId_projectId_status_idx` ON `VideoTask` (`userId`, `projectId`, `status`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_provider_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND INDEX_NAME = 'VideoTask_provider_externalTaskId_idx';
SET @sql = IF(@has_video_provider_index = 0,
  'CREATE INDEX `VideoTask_provider_externalTaskId_idx` ON `VideoTask` (`provider`, `externalTaskId`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_retry_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND INDEX_NAME = 'VideoTask_retryOfTaskId_idx';
SET @sql = IF(@has_video_retry_index = 0,
  'CREATE INDEX `VideoTask_retryOfTaskId_idx` ON `VideoTask` (`retryOfTaskId`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_idempotency_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask' AND INDEX_NAME = 'VideoTask_idempotencyKey_key';
SET @sql = IF(@has_video_idempotency_index = 0,
  'CREATE UNIQUE INDEX `VideoTask_idempotencyKey_key` ON `VideoTask` (`idempotencyKey`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_avatar_project_fk
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'Avatar'
  AND CONSTRAINT_NAME = 'Avatar_projectId_fkey';
SET @sql = IF(@has_avatar_project_fk = 0,
  'ALTER TABLE `Avatar` ADD CONSTRAINT `Avatar_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_project_fk
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask'
  AND CONSTRAINT_NAME = 'VideoTask_projectId_fkey';
SET @sql = IF(@has_video_project_fk = 0,
  'ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_video_aim_fk
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'VideoTask'
  AND CONSTRAINT_NAME = 'VideoTask_aimGenerationId_fkey';
SET @sql = IF(@has_video_aim_fk = 0,
  'ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_aimGenerationId_fkey` FOREIGN KEY (`aimGenerationId`) REFERENCES `AimGeneration` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
