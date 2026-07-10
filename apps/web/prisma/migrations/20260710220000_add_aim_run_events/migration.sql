CREATE TABLE `AimRunEvent` (
  `id` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(40) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `event` VARCHAR(24) NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AimRunEvent_runId_createdAt_idx`(`runId`, `createdAt` DESC),
  INDEX `AimRunEvent_userId_createdAt_idx`(`userId`, `createdAt` DESC),
  INDEX `AimRunEvent_event_createdAt_idx`(`event`, `createdAt` DESC),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AimRunEvent`
  ADD CONSTRAINT `AimRunEvent_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
