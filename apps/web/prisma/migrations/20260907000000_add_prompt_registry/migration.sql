-- Additive: Prompt Registry（Step①）—— prompt 一等资产化，批0 建表。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS `PromptTemplate` (
  `key` VARCHAR(120) NOT NULL,
  `domain` VARCHAR(40) NOT NULL,
  `description` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`key`),
  INDEX `PromptTemplate_domain_idx` (`domain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PromptVersion` (
  `id` VARCHAR(191) NOT NULL,
  `templateKey` VARCHAR(120) NOT NULL,
  -- ⚠️ 必须是 TEXT：MySQL VARCHAR(191) 会截断数千字 prompt
  `content` TEXT NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `version` INTEGER NOT NULL,
  `fixtureKey` VARCHAR(120) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PromptVersion_templateKey_version_key` (`templateKey`, `version`),
  INDEX `PromptVersion_status_idx` (`status`),
  INDEX `PromptVersion_fixtureKey_idx` (`fixtureKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PromptVersion`
  ADD CONSTRAINT `PromptVersion_templateKey_fkey`
  FOREIGN KEY (`templateKey`) REFERENCES `PromptTemplate`(`key`)
  ON DELETE CASCADE ON UPDATE CASCADE;
