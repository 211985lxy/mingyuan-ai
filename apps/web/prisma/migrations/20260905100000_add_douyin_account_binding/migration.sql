-- Additive: Douyin OAuth account binding (user ↔ open_id with token + profile snapshot).
CREATE TABLE IF NOT EXISTS `DouyinAccountBinding` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `openId` VARCHAR(128) NOT NULL,
  `unionId` VARCHAR(128) NULL,
  `scope` VARCHAR(500) NOT NULL,
  `accessToken` VARCHAR(512) NOT NULL,
  `refreshToken` VARCHAR(512) NOT NULL,
  `accessExpiresAt` DATETIME(3) NOT NULL,
  `profileSnapshot` JSON NULL,
  `lastSyncedAt` DATETIME(3) NULL,
  `syncStatus` VARCHAR(20) NOT NULL DEFAULT 'ok',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `DouyinAccountBinding_userId_openId_key` (`userId`, `openId`),
  INDEX `DouyinAccountBinding_openId_idx` (`openId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DouyinAccountBinding`
  ADD CONSTRAINT `DouyinAccountBinding_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
