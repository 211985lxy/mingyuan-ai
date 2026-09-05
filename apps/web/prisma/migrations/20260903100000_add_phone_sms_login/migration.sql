-- Additive: phone + SMS verification code login channel.
ALTER TABLE `User`
  ADD COLUMN `phone` VARCHAR(20) NULL,
  ADD UNIQUE INDEX `User_phone_key` (`phone`);

-- 短信验证码：只存哈希、5 分钟有效、失败计数、一次性消费
CREATE TABLE IF NOT EXISTS `SmsVerificationCode` (
  `id` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(191) NOT NULL DEFAULT 'login',
  `expiresAt` DATETIME(3) NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `consumedAt` DATETIME(3) NULL,
  `ip` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `SmsVerificationCode_phone_createdAt_idx` (`phone`, `createdAt`),
  INDEX `SmsVerificationCode_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
