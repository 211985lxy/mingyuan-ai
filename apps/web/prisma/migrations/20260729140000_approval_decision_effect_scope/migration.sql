-- AlterTable: ApprovalDecision 加法字段（历史行 workflowId/projectId 为 NULL=unknown；effectStatus 默认 none）
ALTER TABLE `ApprovalDecision`
  ADD COLUMN `workflowId` VARCHAR(120) NULL,
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `effectStatus` VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN `effectError` TEXT NULL;

CREATE INDEX `ApprovalDecision_workflowId_effectStatus_idx` ON `ApprovalDecision`(`workflowId`, `effectStatus`);
