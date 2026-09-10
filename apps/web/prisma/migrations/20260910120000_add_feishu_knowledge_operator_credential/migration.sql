-- Additive: 飞书知识检索运营者授权（加密存储 refresh/access token）。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS `FeishuKnowledgeOperatorCredential` (
  `id` VARCHAR(191) NOT NULL,
  `label` VARCHAR(32) NOT NULL,
  `openId` VARCHAR(128) NULL,
  `encryptedAccessToken` TEXT NOT NULL,
  `encryptedRefreshToken` TEXT NOT NULL,
  `accessTokenExpiresAt` DATETIME(3) NOT NULL,
  `refreshTokenExpiresAt` DATETIME(3) NULL,
  `scope` VARCHAR(500) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `FeishuKnowledgeOperatorCredential_label_key` (`label`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
