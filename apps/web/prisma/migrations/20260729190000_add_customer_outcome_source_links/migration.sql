-- Additive evidence links for the Feishu customer-outcome projection and case candidate.
ALTER TABLE `CustomerOutcomeProjection`
    ADD COLUMN `externalRecordId` VARCHAR(80) NULL,
    ADD COLUMN `externalTableId` VARCHAR(80) NULL;

CREATE UNIQUE INDEX `CustomerOutcomeProjection_externalRecordId_key`
    ON `CustomerOutcomeProjection`(`externalRecordId`);

ALTER TABLE `AssetCandidate`
    ADD COLUMN `customerOutcomeProjectionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `AssetCandidate_customerOutcomeProjectionId_key`
    ON `AssetCandidate`(`customerOutcomeProjectionId`);

ALTER TABLE `AssetCandidate`
    ADD CONSTRAINT `AssetCandidate_customerOutcomeProjectionId_fkey`
    FOREIGN KEY (`customerOutcomeProjectionId`)
    REFERENCES `CustomerOutcomeProjection`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
