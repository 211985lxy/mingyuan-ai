-- Add externalAccountId to ChannelBinding + Inspiration
-- Upgrade unique constraint from (platform, externalChatId) to (platform, externalAccountId, externalChatId)
-- Idempotent: safe to re-run

SET NAMES utf8mb4;

-- 1. Add externalAccountId column to ChannelBinding
SET @ddl = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ChannelBinding' AND column_name = 'externalAccountId');
SET @sql = IF(@ddl = 0,
  'ALTER TABLE ChannelBinding ADD COLUMN externalAccountId VARCHAR(191) NOT NULL DEFAULT '''' AFTER externalChatId',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Backfill: set externalAccountId = '' for all existing rows (already done by DEFAULT)
-- No-op — the NOT NULL DEFAULT '' handles this.

-- 3. Add externalAccountId to Inspiration
SET @ddl = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'Inspiration' AND column_name = 'externalAccountId');
SET @sql = IF(@ddl = 0,
  'ALTER TABLE Inspiration ADD COLUMN externalAccountId VARCHAR(191) NULL AFTER externalChatId',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Drop old unique index and create new three-column unique index
-- MySQL requires dropping the old index before creating a new one covering the same columns
SET @idx = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ChannelBinding'
  AND index_name = 'ChannelBinding_platform_externalChatId_key');
SET @sql = IF(@idx > 0,
  'ALTER TABLE ChannelBinding DROP INDEX ChannelBinding_platform_externalChatId_key',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create new unique index (skip if already exists)
SET @idx = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ChannelBinding'
  AND index_name = 'ChannelBinding_platform_externalAccountId_externalChatId_key');
SET @sql = IF(@idx = 0,
  'CREATE UNIQUE INDEX ChannelBinding_platform_externalAccountId_externalChatId_key ON ChannelBinding(platform, externalAccountId, externalChatId)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
