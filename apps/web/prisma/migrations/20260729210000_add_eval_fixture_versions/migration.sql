CREATE TABLE IF NOT EXISTS `EvalFixtureVersion` (
    `id` VARCHAR(191) NOT NULL,
    `fixtureKey` VARCHAR(120) NOT NULL,
    `version` INTEGER NOT NULL,
    `sourceCandidateId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `deterministicPassedAt` DATETIME(3) NULL,
    `dailyPassedAt` DATETIME(3) NULL,
    `qualificationMetrics` JSON NULL,
    `qualificationEvidenceRef` VARCHAR(500) NULL,
    `activationApprovalId` VARCHAR(191) NULL,
    `activatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EvalFixtureVersion_sourceCandidateId_key`(`sourceCandidateId`),
    UNIQUE INDEX `EvalFixtureVersion_fixtureKey_version_key`(`fixtureKey`, `version`),
    UNIQUE INDEX `EvalFixtureVersion_activationApprovalId_key`(`activationApprovalId`),
    INDEX `EvalFixtureVersion_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EvalFixtureVersion`
    ADD CONSTRAINT `EvalFixtureVersion_sourceCandidateId_fkey`
    FOREIGN KEY (`sourceCandidateId`) REFERENCES `LearningCandidate`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
