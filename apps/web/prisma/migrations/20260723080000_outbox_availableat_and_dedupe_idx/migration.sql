-- V2.1 Batch A: Outbox reliability improvements
-- 1. Add `availableAt` column for exponential backoff retry scheduling
-- 2. Add (inspirationId, replyType) unique constraint for idempotent enqueue
-- 3. Add status+availableAt index for efficient claim queries

-- Column: availableAt (nullable DateTime, null = immediately available)
SELECT 'Adding availableAt column to ChannelReplyOutbox' AS msg;
ALTER TABLE ChannelReplyOutbox ADD COLUMN IF NOT EXISTS availableAt DATETIME(3) NULL;

-- Index: efficient filtering for claim queries
SELECT 'Creating index on (status, availableAt)' AS msg;
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ChannelReplyOutbox' AND index_name = 'ChannelReplyOutbox_status_availableAt_idx');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX ChannelReplyOutbox_status_availableAt_idx ON ChannelReplyOutbox(status, availableAt)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Unique constraint: one outbox entry per (inspirationId, replyType)
-- First, clean up any pre-existing duplicates (keep the latest per group)
SELECT 'Removing duplicate (inspirationId, replyType) pairs' AS msg;
DELETE t1 FROM ChannelReplyOutbox t1
  INNER JOIN ChannelReplyOutbox t2
  ON t1.inspirationId = t2.inspirationId
  AND t1.replyType = t2.replyType
  AND t1.createdAt < t2.createdAt;

-- Add the unique constraint
SELECT 'Creating unique index on (inspirationId, replyType)' AS msg;
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ChannelReplyOutbox' AND index_name = 'ChannelReplyOutbox_inspirationId_replyType_key');
SET @sql = IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX ChannelReplyOutbox_inspirationId_replyType_key ON ChannelReplyOutbox(inspirationId, replyType)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
