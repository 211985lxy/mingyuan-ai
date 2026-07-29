ALTER TABLE `ReviewCycle`
    ADD COLUMN `requestId` VARCHAR(191) NULL,
    ADD COLUMN `signedApprovalId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `ReviewCycle_requestId_key`
    ON `ReviewCycle`(`requestId`);

CREATE UNIQUE INDEX `ReviewCycle_signedApprovalId_key`
    ON `ReviewCycle`(`signedApprovalId`);
