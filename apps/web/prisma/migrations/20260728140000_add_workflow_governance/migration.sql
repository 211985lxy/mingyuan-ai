-- CreateTable
CREATE TABLE IF NOT EXISTS `GovernanceAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `scopeType` VARCHAR(20) NOT NULL,
    `scopeId` VARCHAR(120) NOT NULL,
    `role` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `externalOpenId` VARCHAR(120) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `effectiveAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GovernanceAssignment_scopeType_scopeId_status_idx`(`scopeType`, `scopeId`, `status`),
    INDEX `GovernanceAssignment_role_status_idx`(`role`, `status`),
    INDEX `GovernanceAssignment_userId_idx`(`userId`),
    INDEX `GovernanceAssignment_externalOpenId_idx`(`externalOpenId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ApprovalDecision` (
    `id` VARCHAR(191) NOT NULL,
    `subjectType` VARCHAR(40) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `decision` VARCHAR(20) NOT NULL,
    `reviewerUserId` VARCHAR(191) NULL,
    `externalReviewerId` VARCHAR(120) NULL,
    `roleSnapshot` VARCHAR(80) NOT NULL,
    `reason` TEXT NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `requestId` VARCHAR(120) NOT NULL,
    `decidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApprovalDecision_requestId_key`(`requestId`),
    INDEX `ApprovalDecision_subjectType_subjectId_idx`(`subjectType`, `subjectId`),
    INDEX `ApprovalDecision_reviewerUserId_idx`(`reviewerUserId`),
    INDEX `ApprovalDecision_externalReviewerId_idx`(`externalReviewerId`),
    INDEX `ApprovalDecision_decidedAt_idx`(`decidedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
