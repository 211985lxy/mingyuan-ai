-- WP-2 additive hardening: keep Feishu open_id/user_id distinct and claim side effects atomically.
ALTER TABLE `GovernanceAssignment`
  ADD COLUMN `externalUserId` VARCHAR(120) NULL;

ALTER TABLE `ApprovalDecision`
  ADD COLUMN `externalReviewerUserId` VARCHAR(120) NULL,
  ADD COLUMN `effectClaimToken` VARCHAR(191) NULL,
  ADD COLUMN `effectClaimedAt` DATETIME(3) NULL;

CREATE INDEX `GovernanceAssignment_externalUserId_idx`
  ON `GovernanceAssignment`(`externalUserId`);

CREATE INDEX `ApprovalDecision_externalReviewerUserId_idx`
  ON `ApprovalDecision`(`externalReviewerUserId`);
