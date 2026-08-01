-- Custom AIM skills used by the workbench skill menu.
-- Additive and idempotent so environments that already created the table manually stay deployable.
CREATE TABLE IF NOT EXISTS `AimCustomSkill` (
  `id` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `agentId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL DEFAULT '',
  `prompt` MEDIUMTEXT NOT NULL,
  `group` VARCHAR(191) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `AimCustomSkill_agentId_skillId_key` (`agentId`, `skillId`),
  INDEX `AimCustomSkill_agentId_idx` (`agentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
