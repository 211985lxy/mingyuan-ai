-- CreateTable
CREATE TABLE IF NOT EXISTS `OutcomeAttribution` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `generationId` VARCHAR(191) NOT NULL,
    `externalLeadId` VARCHAR(80) NOT NULL,
    `externalAppointmentId` VARCHAR(80) NULL,
    `externalDealId` VARCHAR(80) NULL,
    `externalPaymentId` VARCHAR(80) NULL,
    `attributionMethod` VARCHAR(20) NOT NULL,
    `attributionConfidence` VARCHAR(10) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OutcomeAttribution_externalLeadId_key`(`externalLeadId`),
    UNIQUE INDEX `OutcomeAttribution_externalDealId_key`(`externalDealId`),
    UNIQUE INDEX `OutcomeAttribution_externalPaymentId_key`(`externalPaymentId`),
    INDEX `OutcomeAttribution_userId_occurredAt_idx`(`userId`, `occurredAt`),
    INDEX `OutcomeAttribution_generationId_idx`(`generationId`),
    INDEX `OutcomeAttribution_attributionMethod_idx`(`attributionMethod`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OutcomeAttribution` ADD CONSTRAINT `OutcomeAttribution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OutcomeAttribution` ADD CONSTRAINT `OutcomeAttribution_generationId_fkey` FOREIGN KEY (`generationId`) REFERENCES `AimGeneration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
