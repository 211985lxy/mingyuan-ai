-- ChannelReplyOutbox: async reply delivery outbox
-- Idempotent: safe to re-run

SET NAMES utf8mb4;

-- Create table only if not exists
SET @ddl = (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'ChannelReplyOutbox');
SET @sql = IF(@ddl = 0,
  'CREATE TABLE ChannelReplyOutbox (
    id VARCHAR(191) NOT NULL,
    inspirationId VARCHAR(191) NOT NULL,
    replyType VARCHAR(20) NOT NULL,
    platform VARCHAR(40) NOT NULL,
    externalAccountId VARCHAR(191) NULL,
    externalChatId VARCHAR(191) NOT NULL,
    externalMessageId VARCHAR(191) NULL,
    replyText TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT ''pending'',
    claimToken VARCHAR(191) NULL,
    claimExpiresAt DATETIME(3) NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    maxAttempts INTEGER NOT NULL DEFAULT 5,
    lastError TEXT NULL,
    sentAt DATETIME(3) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    UNIQUE INDEX ChannelReplyOutbox_claimToken_key (claimToken),
    INDEX ChannelReplyOutbox_status_createdAt_idx (status, createdAt),
    INDEX ChannelReplyOutbox_platform_status_idx (platform, status),
    INDEX ChannelReplyOutbox_status_claimExpiresAt_idx (status, claimExpiresAt),
    PRIMARY KEY (id),
    CONSTRAINT ChannelReplyOutbox_inspirationId_fkey
      FOREIGN KEY (inspirationId) REFERENCES Inspiration(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
