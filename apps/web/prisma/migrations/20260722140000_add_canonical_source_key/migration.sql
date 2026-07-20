-- Add canonicalSourceKey to Inspiration for content-level dedup
-- Idempotent: safe to re-run

SET NAMES utf8mb4;

SET @ddl = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'Inspiration' AND column_name = 'canonicalSourceKey');
SET @sql = IF(@ddl = 0,
  'ALTER TABLE Inspiration ADD COLUMN canonicalSourceKey VARCHAR(255) NULL AFTER sourceUrl',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create unique index (skip if already exists)
SET @idx = (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'Inspiration'
  AND index_name = 'Inspiration_canonicalSourceKey_key');
SET @sql = IF(@idx = 0,
  'CREATE UNIQUE INDEX Inspiration_canonicalSourceKey_key ON Inspiration(canonicalSourceKey)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
