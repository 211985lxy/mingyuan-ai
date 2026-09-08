-- Additive: 语音工坊合成记录（Fish Audio TTS 落库 MVP 补全）。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。

CREATE TABLE IF NOT EXISTS `VoiceSynthesisRecord` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'fish_audio',
  `model` VARCHAR(64) NOT NULL,
  `voiceId` VARCHAR(64) NULL,
  `format` VARCHAR(8) NOT NULL,
  `textPreview` VARCHAR(200) NOT NULL,
  `charCount` INTEGER NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'succeeded',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `VoiceSynthesisRecord_userId_createdAt_idx` (`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
