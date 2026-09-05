-- Additive: phone-primary Douyin login identity and short-lived OAuth challenge.
CREATE TABLE IF NOT EXISTS `DouyinLoginIdentity` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `openId` VARCHAR(128) NOT NULL,
  `unionId` VARCHAR(128) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `DouyinLoginIdentity_openId_key` (`openId`),
  INDEX `DouyinLoginIdentity_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DouyinLoginChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `stateHash` VARCHAR(64) NOT NULL,
  `openId` VARCHAR(128) NOT NULL,
  `unionId` VARCHAR(128) NULL,
  `scope` VARCHAR(500) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `DouyinLoginChallenge_stateHash_key` (`stateHash`),
  INDEX `DouyinLoginChallenge_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DouyinLoginIdentity`
  ADD CONSTRAINT `DouyinLoginIdentity_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
