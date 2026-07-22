-- Named methodology profile (ADR-002)
-- Two new tables, all additive, zero backfill. Idempotent via information_schema checks
-- (same pattern as 20260725090000_add_agent_invocation).
--
-- MethodologyProfile: 通用命名方法论的权威载体（如「徐沪生创作方法论」）。
--   userId NULL = 全局；非 NULL = 用户私有。与 AgentMethodology（系统 3-key）互不重叠。
-- MethodologyProfileVersion: 版本化内容；只有 published 版本进生成链路；
--   修改即创建新版本，旧版本不可原地修改，保证历史 Prompt 可复现。

-- ── 1. MethodologyProfile ──────────────────────────────────────────────────
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MethodologyProfile');
SET @sql = IF(@tbl_exists = 0,
  'CREATE TABLE MethodologyProfile (
    id VARCHAR(191) NOT NULL,
    userId VARCHAR(191) NULL,
    name VARCHAR(191) NOT NULL,
    slug VARCHAR(191) NOT NULL,
    originatorName VARCHAR(191) NULL,
    aliases JSON NOT NULL,
    methodologyType VARCHAR(191) NOT NULL,
    scope VARCHAR(191) NOT NULL,
    description TEXT NULL,
    applicableAgents JSON NOT NULL,
    applicableTasks JSON NOT NULL,
    applicableChannels JSON NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    status VARCHAR(191) NOT NULL DEFAULT ''active'',
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE INDEX MethodologyProfile_slug_key (slug),
    INDEX MethodologyProfile_status_idx (status),
    INDEX MethodologyProfile_userId_status_idx (userId, status),
    CONSTRAINT MethodologyProfile_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. MethodologyProfileVersion ───────────────────────────────────────────
SET @tbl_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'MethodologyProfileVersion');
SET @sql = IF(@tbl_exists = 0,
  'CREATE TABLE MethodologyProfileVersion (
    id VARCHAR(191) NOT NULL,
    profileId VARCHAR(191) NOT NULL,
    version INTEGER NOT NULL,
    contentMarkdown LONGTEXT NOT NULL,
    compiledPrompt LONGTEXT NOT NULL,
    sourceRefs JSON NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    status VARCHAR(191) NOT NULL DEFAULT ''published'',
    rightsNote TEXT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    publishedAt DATETIME(3) NULL,
    PRIMARY KEY (id),
    UNIQUE INDEX MethodologyProfileVersion_profileId_version_key (profileId, version),
    INDEX MethodologyProfileVersion_profileId_status_idx (profileId, status),
    CONSTRAINT MethodologyProfileVersion_profileId_fkey FOREIGN KEY (profileId) REFERENCES MethodologyProfile(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
