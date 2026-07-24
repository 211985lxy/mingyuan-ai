-- 记忆治理：候选态默认写入（14 周正本阶段 4）
-- 兼容：扩展 status 语义并新增治理字段；回填既有 active 行。

ALTER TABLE `AimMemory` MODIFY COLUMN `status` VARCHAR(24) NOT NULL DEFAULT 'candidate';

ALTER TABLE `AimMemory` ADD COLUMN `confidence` DOUBLE NULL;
ALTER TABLE `AimMemory` ADD COLUMN `sourceRef` VARCHAR(191) NULL;
ALTER TABLE `AimMemory` ADD COLUMN `reviewerId` VARCHAR(191) NULL;
ALTER TABLE `AimMemory` ADD COLUMN `reviewedAt` DATETIME(3) NULL;
ALTER TABLE `AimMemory` ADD COLUMN `expiresAt` DATETIME(3) NULL;
ALTER TABLE `AimMemory` ADD COLUMN `supersededById` VARCHAR(191) NULL;
ALTER TABLE `AimMemory` ADD COLUMN `creationBasis` VARCHAR(80) NULL;

-- 既有行保持原 status（多为 active），仅新写入默认 candidate
CREATE INDEX `AimMemory_userId_projectId_status_idx` ON `AimMemory`(`userId`, `projectId`, `status`);
