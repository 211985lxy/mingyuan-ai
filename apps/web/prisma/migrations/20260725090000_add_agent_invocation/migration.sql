-- AIM Remote Invocation (V2.1)
-- 1. Extend AgentApiKey with remote-capability columns (all nullable/defaulted, zero backfill)
-- 2. Add invocationId to AgentApiCallLog (append-only audit link)
-- 3. Create AgentInvocation table (remote request envelope, NOT a second agent state machine)

-- ── 1. AgentApiKey extensions ──────────────────────────────────────────────
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'clientType');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN clientType VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'allowedScopes');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN allowedScopes JSON NOT NULL DEFAULT (JSON_ARRAY())', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'minuteLimit');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN minuteLimit INTEGER NOT NULL DEFAULT 60', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'dailyTokenLimit');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN dailyTokenLimit INTEGER NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'maxInputChars');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN maxInputChars INTEGER NOT NULL DEFAULT 50000', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiKey' AND COLUMN_NAME = 'expiresAt');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiKey ADD COLUMN expiresAt DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. AgentApiCallLog.invocationId ────────────────────────────────────────
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentApiCallLog' AND COLUMN_NAME = 'invocationId');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE AgentApiCallLog ADD COLUMN invocationId VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. AgentInvocation table ──────────────────────────────────────────────
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AgentInvocation');
SET @sql = IF(@tbl_exists = 0,
  'CREATE TABLE AgentInvocation (
    id VARCHAR(191) NOT NULL,
    apiKeyId VARCHAR(191) NOT NULL,
    userId VARCHAR(191) NOT NULL,
    projectId VARCHAR(191) NOT NULL,
    agentId VARCHAR(191) NOT NULL,
    action VARCHAR(191) NOT NULL DEFAULT ''draft.generate'',
    idempotencyKey VARCHAR(128) NOT NULL,
    requestHash VARCHAR(64) NOT NULL,
    rawInput MEDIUMTEXT NOT NULL,
    targetFormats JSON NOT NULL,
    instruction TEXT NULL,
    status VARCHAR(24) NOT NULL DEFAULT ''queued'',
    backgroundTaskId VARCHAR(191) NULL,
    runId VARCHAR(64) NULL,
    aimGenerationId VARCHAR(30) NULL,
    provider VARCHAR(64) NULL,
    model VARCHAR(128) NULL,
    degraded BOOLEAN NOT NULL DEFAULT FALSE,
    inputTokens INTEGER NULL,
    outputTokens INTEGER NULL,
    costCny DECIMAL(10, 6) NULL,
    errorCode VARCHAR(48) NULL,
    errorMessage TEXT NULL,
    queuedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    startedAt DATETIME(3) NULL,
    completedAt DATETIME(3) NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT AgentInvocation_apiKeyId_fkey FOREIGN KEY (apiKeyId) REFERENCES AgentApiKey(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT AgentInvocation_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE INDEX AgentInvocation_apiKeyId_action_idempotencyKey_key (apiKeyId, action, idempotencyKey),
    INDEX AgentInvocation_apiKeyId_status_idx (apiKeyId, status),
    INDEX AgentInvocation_userId_createdAt_idx (userId, createdAt DESC),
    INDEX AgentInvocation_status_queuedAt_idx (status, queuedAt)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
