-- Destructive retirement of the former video-generation subsystem.
-- Run `pnpm schema:retired-media-preflight` before applying this migration.

DROP TABLE `VideoTask`;
DROP TABLE `VideoProductionPlan`;
DROP TABLE `VideoPackagingTemplate`;
DROP TABLE `PublicAvatarPreviewPreference`;
DROP TABLE `PublicAvatarPreviewCache`;
DROP TABLE `Avatar`;
DROP TABLE `PexelsQueryCache`;
DROP TABLE `PexelsMedia`;

DELETE FROM `Asset` WHERE `assetType` = 'voice';

ALTER TABLE `Asset`
  DROP INDEX `Asset_externalTaskId_key`,
  DROP INDEX `Asset_externalTaskId_idx`,
  DROP INDEX `Asset_sourceAvatarId_idx`,
  DROP COLUMN `sourceAvatarId`,
  DROP COLUMN `externalTaskId`,
  DROP COLUMN `externalSpeakerId`,
  DROP COLUMN `voiceModel`,
  DROP COLUMN `demoAudioUrl`,
  DROP COLUMN `retryCount`;

ALTER TABLE `ContentTemplate`
  DROP COLUMN `shanjianStyleId`,
  DROP COLUMN `videoType`,
  DROP COLUMN `packRulesJson`,
  DROP COLUMN `processRulesJson`;

ALTER TABLE `User` DROP COLUMN `authVideoUrl`;
