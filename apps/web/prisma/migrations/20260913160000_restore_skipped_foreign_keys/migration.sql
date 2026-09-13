-- 补齐 2026-09-08 被 `migrate resolve --applied` 强制跳过的迁移所丢失的 DDL。
--
-- 背景：`20260906100000_add_project_scope_to_legacy_content` 执行失败（错误码 1060，
-- 列已存在）后被标记为已完成，而记录里 `applied_steps_count = 0` —— 该迁移的 SQL
-- 一条都没跑。此后所有部署都认为它已生效，永久跳过，于是这批表加了 `projectId`
-- 列却从未建立外键，关联一直没有引用完整性。
--
-- 范围按生产库实测收敛，只补真正缺失的 9 个外键与 1 个索引。Prisma diff 另外报出的
-- 同名约束重建属于定义差异（约束本已存在），不在本次范围内，避免无谓地重建线上外键。
--
-- 纯增量：只加约束与索引，不改列、不删行、不迁移数据。
-- 幂等：每条先查 INFORMATION_SCHEMA 再执行，可重复运行。
--
-- 前置校验（2026-09-13 实测）：以下 9 个外键逐一做过孤儿行检查，均为 0 行。

-- CompetitorAnalysis
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CompetitorAnalysis' AND CONSTRAINT_NAME = 'CompetitorAnalysis_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `CompetitorAnalysis` ADD CONSTRAINT `CompetitorAnalysis_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ContentGenerationRun
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContentGenerationRun' AND CONSTRAINT_NAME = 'ContentGenerationRun_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `ContentGenerationRun` ADD CONSTRAINT `ContentGenerationRun_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- OpportunityCollection
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OpportunityCollection' AND CONSTRAINT_NAME = 'OpportunityCollection_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `OpportunityCollection` ADD CONSTRAINT `OpportunityCollection_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- OpportunityCollection
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OpportunityCollection' AND CONSTRAINT_NAME = 'OpportunityCollection_userId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `OpportunityCollection` ADD CONSTRAINT `OpportunityCollection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- OpportunityItemSnapshot
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OpportunityItemSnapshot' AND CONSTRAINT_NAME = 'OpportunityItemSnapshot_searchRunId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `OpportunityItemSnapshot` ADD CONSTRAINT `OpportunityItemSnapshot_searchRunId_fkey` FOREIGN KEY (`searchRunId`) REFERENCES `OpportunitySearchRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- OpportunitySearchRun
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'OpportunitySearchRun' AND CONSTRAINT_NAME = 'OpportunitySearchRun_userId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `OpportunitySearchRun` ADD CONSTRAINT `OpportunitySearchRun_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Script
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Script' AND CONSTRAINT_NAME = 'Script_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `Script` ADD CONSTRAINT `Script_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- VideoCopyExtraction
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VideoCopyExtraction' AND CONSTRAINT_NAME = 'VideoCopyExtraction_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `VideoCopyExtraction` ADD CONSTRAINT `VideoCopyExtraction_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- WatchAccount
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'WatchAccount' AND CONSTRAINT_NAME = 'WatchAccount_projectId_fkey');
SET @sql := IF(@has = 0,
  'ALTER TABLE `WatchAccount` ADD CONSTRAINT `WatchAccount_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ChannelBinding_projectId_status_idx
SET @has := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ChannelBinding'
    AND INDEX_NAME = 'ChannelBinding_projectId_status_idx');
SET @sql := IF(@has = 0,
  'CREATE INDEX `ChannelBinding_projectId_status_idx` ON `ChannelBinding`(`projectId`, `status`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
