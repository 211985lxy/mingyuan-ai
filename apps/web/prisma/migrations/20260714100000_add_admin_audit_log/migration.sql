CREATE TABLE `AdminAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `adminId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `targetType` VARCHAR(80) NOT NULL,
  `targetId` VARCHAR(191) NULL,
  `requestId` VARCHAR(80) NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AdminAuditLog_adminId_createdAt_idx` (`adminId`, `createdAt`),
  INDEX `AdminAuditLog_targetType_targetId_idx` (`targetType`, `targetId`),
  INDEX `AdminAuditLog_requestId_idx` (`requestId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AdminAuditLog_adminId_fkey`
    FOREIGN KEY (`adminId`) REFERENCES `AdminUser` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
