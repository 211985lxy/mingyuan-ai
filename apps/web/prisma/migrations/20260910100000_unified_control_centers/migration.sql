-- Unified statistics/audit control centers. All changes are additive.

ALTER TABLE `AdminAuditLog`
  ADD COLUMN `correlationId` VARCHAR(80) NULL,
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'success',
  ADD COLUMN `severity` VARCHAR(16) NOT NULL DEFAULT 'info';

CREATE INDEX `AdminAuditLog_status_createdAt_idx`
  ON `AdminAuditLog`(`status`, `createdAt`);
CREATE INDEX `AdminAuditLog_correlationId_createdAt_idx`
  ON `AdminAuditLog`(`correlationId`, `createdAt`);

ALTER TABLE `AuditEvent`
  ADD COLUMN `payloadHash` VARCHAR(64) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS `AuditReconcileCheckpoint` (
  `id` VARCHAR(191) NOT NULL,
  `source` VARCHAR(32) NOT NULL,
  `highWatermarkAt` DATETIME(3) NULL,
  `highWatermarkId` VARCHAR(191) NULL,
  `backfillCursor` TEXT NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `scanned` INTEGER NOT NULL DEFAULT 0,
  `indexed` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AuditReconcileCheckpoint_source_key` (`source`),
  INDEX `AuditReconcileCheckpoint_lastSuccessAt_idx` (`lastSuccessAt`),
  INDEX `AuditReconcileCheckpoint_source_updatedAt_idx` (`source`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OperationalAlert` (
  `id` VARCHAR(191) NOT NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `rule` VARCHAR(80) NOT NULL,
  `severity` VARCHAR(16) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'open',
  `summary` TEXT NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `correlationId` VARCHAR(80) NULL,
  `metadata` JSON NULL,
  `firstSeenAt` DATETIME(3) NOT NULL,
  `lastSeenAt` DATETIME(3) NOT NULL,
  `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
  `lastNotifiedAt` DATETIME(3) NULL,
  `acknowledgedAt` DATETIME(3) NULL,
  `acknowledgedBy` VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolvedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `OperationalAlert_fingerprint_key` (`fingerprint`),
  INDEX `OperationalAlert_status_severity_lastSeenAt_idx` (`status`, `severity`, `lastSeenAt`),
  INDEX `OperationalAlert_rule_lastSeenAt_idx` (`rule`, `lastSeenAt`),
  INDEX `OperationalAlert_source_lastSeenAt_idx` (`source`, `lastSeenAt`),
  INDEX `OperationalAlert_correlationId_lastSeenAt_idx` (`correlationId`, `lastSeenAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ChannelMetricDaily` (
  `id` VARCHAR(191) NOT NULL,
  `day` VARCHAR(10) NOT NULL,
  `platform` VARCHAR(40) NOT NULL,
  `metric` VARCHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChannelMetricDaily_day_platform_metric_key` (`day`, `platform`, `metric`),
  INDEX `ChannelMetricDaily_day_platform_idx` (`day`, `platform`),
  INDEX `ChannelMetricDaily_metric_day_idx` (`metric`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
