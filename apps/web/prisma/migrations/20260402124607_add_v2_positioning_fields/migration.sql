-- AlterTable
ALTER TABLE `IpProfile` ADD COLUMN `profileVersion` INTEGER NULL DEFAULT 1,
    ADD COLUMN `surveyIndustry` VARCHAR(191) NULL,
    ADD COLUMN `surveyTargetCustomer` TEXT NULL,
    ADD COLUMN `surveyMonetization` JSON NULL,
    ADD COLUMN `surveyPersonalTraits` TEXT NULL,
    ADD COLUMN `surveyContentGoal` VARCHAR(191) NULL,
    ADD COLUMN `business` JSON NULL,
    ADD COLUMN `persona` JSON NULL,
    ADD COLUMN `content` JSON NULL;

-- CreateIndex
CREATE INDEX `IpProfile_profileVersion_idx` ON `IpProfile`(`profileVersion`);
