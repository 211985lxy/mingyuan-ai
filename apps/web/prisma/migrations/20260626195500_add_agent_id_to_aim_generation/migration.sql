ALTER TABLE `AimGeneration` ADD COLUMN `agentId` VARCHAR(191) NULL;

UPDATE `AimGeneration`
SET `agentId` = CASE
  WHEN `rawCopy` IS NOT NULL
    AND `videoScript` IS NULL
    AND `wechatArticle` IS NULL
    AND `momentsPost` IS NULL
    AND `communityMessage` IS NULL
    AND `shootingBrief` IS NULL THEN 'deep_copywriter'
  ELSE 'ip_video'
END
WHERE `agentId` IS NULL;

