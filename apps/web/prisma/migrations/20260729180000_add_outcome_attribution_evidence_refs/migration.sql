-- WP-3 additive evidence references for the read-only Feishu projection.
ALTER TABLE `OutcomeAttribution`
  ADD COLUMN `externalRecordId` VARCHAR(80) NULL,
  ADD COLUMN `externalTableId` VARCHAR(80) NULL,
  ADD COLUMN `externalSourceContentId` VARCHAR(80) NULL,
  ADD COLUMN `externalAttributionConfirmer` VARCHAR(120) NULL;

CREATE UNIQUE INDEX `OutcomeAttribution_externalRecordId_key`
  ON `OutcomeAttribution`(`externalRecordId`);
