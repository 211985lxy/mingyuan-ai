-- Restore retired digital-human / video-generation domain (reverse of 20260714120000_retire_video_generation).
-- Idempotent-ish: CREATE IF NOT EXISTS for tables; column ALTERs assume post-retirement schema.

CREATE TABLE IF NOT EXISTS `Avatar` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'uploading',
    `coverUrl` VARCHAR(191) NULL,
    `sourceVideoUrl` VARCHAR(191) NULL,
    `externalTaskId` VARCHAR(191) NULL,
    `externalVirtualmanId` VARCHAR(191) NULL,
    `externalSpeakerId` VARCHAR(191) NULL,
    `speakerName` VARCHAR(191) NULL,
    `demoTaskId` VARCHAR(191) NULL,
    `demoVideoUrl` VARCHAR(191) NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Avatar_externalTaskId_key`(`externalTaskId`),
    UNIQUE INDEX `Avatar_demoTaskId_key`(`demoTaskId`),
    INDEX `Avatar_userId_status_idx`(`userId`, `status`),
    INDEX `Avatar_externalTaskId_idx`(`externalTaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `VideoPackagingTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `shanjianId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `coverUrl` VARCHAR(191) NULL,
    `demoUrl` VARCHAR(191) NULL,
    `scene` VARCHAR(191) NOT NULL,
    `capabilities` JSON NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'published',
    `lastSyncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VideoPackagingTemplate_shanjianId_key`(`shanjianId`),
    INDEX `VideoPackagingTemplate_scene_status_idx`(`scene`, `status`),
    INDEX `VideoPackagingTemplate_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `VideoProductionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scriptId` VARCHAR(191) NOT NULL,
    `packagingTemplateId` VARCHAR(191) NULL,
    `structureId` VARCHAR(191) NULL,
    `styleId` VARCHAR(191) NOT NULL,
    `materials` JSON NULL,
    `backgroundMusic` JSON NULL,
    `packRules` JSON NULL,
    `processRules` JSON NULL,
    `recommendationContext` JSON NULL,
    `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VideoProductionPlan_userId_status_idx`(`userId`, `status`),
    INDEX `VideoProductionPlan_scriptId_idx`(`scriptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `VideoTask` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `avatarId` VARCHAR(191) NULL,
    `scriptId` VARCHAR(191) NULL,
    `productionPlanId` VARCHAR(191) NULL,
    `structureId` VARCHAR(191) NULL,
    `packagingTemplateId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `deliveryWarning` TEXT NULL,
    `deliveryExpiresAt` DATETIME(3) NULL,
    `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
    `videoUrl` VARCHAR(191) NULL,
    `coverUrl` VARCHAR(191) NULL,
    `scriptContent` TEXT NOT NULL,
    `avatarName` VARCHAR(191) NOT NULL,
    `duration` INTEGER NULL,
    `externalTaskId` VARCHAR(191) NULL,
    `structureSnapshot` JSON NULL,
    `packagingSnapshot` JSON NULL,
    `shanjianPayload` JSON NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `marketingAnalysis` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `enhancementStatus` VARCHAR(191) NULL,
    `enhancementJobId` VARCHAR(191) NULL,
    `enhanced4kUrl` VARCHAR(191) NULL,
    `enhanced4kCoverUrl` VARCHAR(191) NULL,
    `enhanced4kDuration` INTEGER NULL,
    `enhancementErrorCode` VARCHAR(191) NULL,
    `enhancementErrorMessage` TEXT NULL,
    `enhancementStartedAt` DATETIME(3) NULL,
    `enhancementCompletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `VideoTask_externalTaskId_key`(`externalTaskId`),
    UNIQUE INDEX `VideoTask_enhancementJobId_key`(`enhancementJobId`),
    INDEX `VideoTask_userId_status_idx`(`userId`, `status`),
    INDEX `VideoTask_userId_deliveryStatus_idx`(`userId`, `deliveryStatus`),
    INDEX `VideoTask_externalTaskId_idx`(`externalTaskId`),
    INDEX `VideoTask_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `VideoTask_productionPlanId_idx`(`productionPlanId`),
    INDEX `VideoTask_enhancementStatus_updatedAt_idx`(`enhancementStatus`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `PublicAvatarPreviewCache` (
    `id` VARCHAR(191) NOT NULL,
    `cacheKey` VARCHAR(191) NOT NULL,
    `virtualmanId` VARCHAR(191) NOT NULL,
    `speakerId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `textHash` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'processing',
    `externalTaskId` VARCHAR(191) NULL,
    `videoUrl` VARCHAR(191) NULL,
    `coverUrl` VARCHAR(191) NULL,
    `duration` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NULL,
    `lastAccessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PublicAvatarPreviewCache_cacheKey_key`(`cacheKey`),
    UNIQUE INDEX `PublicAvatarPreviewCache_externalTaskId_key`(`externalTaskId`),
    INDEX `PublicAvatarPreviewCache_virtualmanId_speakerId_idx`(`virtualmanId`, `speakerId`),
    INDEX `PublicAvatarPreviewCache_status_updatedAt_idx`(`status`, `updatedAt`),
    INDEX `PublicAvatarPreviewCache_lastAccessedAt_idx`(`lastAccessedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `PublicAvatarPreviewPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `virtualmanId` VARCHAR(191) NOT NULL,
    `speakerId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `previewCacheId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PublicAvatarPreviewPreference_previewCacheId_idx`(`previewCacheId`),
    INDEX `PublicAvatarPreviewPreference_virtualmanId_updatedAt_idx`(`virtualmanId`, `updatedAt`),
    UNIQUE INDEX `PublicAvatarPreviewPreference_userId_virtualmanId_key`(`userId`, `virtualmanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Restore Asset voice-related columns
ALTER TABLE `Asset`
  ADD COLUMN `sourceAvatarId` VARCHAR(191) NULL,
  ADD COLUMN `externalTaskId` VARCHAR(191) NULL,
  ADD COLUMN `externalSpeakerId` VARCHAR(191) NULL,
  ADD COLUMN `voiceModel` VARCHAR(191) NULL,
  ADD COLUMN `demoAudioUrl` VARCHAR(191) NULL,
  ADD COLUMN `retryCount` INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `Asset_externalTaskId_key` ON `Asset`(`externalTaskId`);
CREATE INDEX `Asset_externalTaskId_idx` ON `Asset`(`externalTaskId`);
CREATE INDEX `Asset_sourceAvatarId_idx` ON `Asset`(`sourceAvatarId`);

ALTER TABLE `ContentTemplate`
  ADD COLUMN `shanjianStyleId` VARCHAR(191) NULL,
  ADD COLUMN `videoType` VARCHAR(191) NOT NULL DEFAULT 'virtualman_broadcast',
  ADD COLUMN `packRulesJson` JSON NULL,
  ADD COLUMN `processRulesJson` JSON NULL;

ALTER TABLE `User` ADD COLUMN `authVideoUrl` VARCHAR(191) NULL;

-- Foreign keys
ALTER TABLE `Avatar` ADD CONSTRAINT `Avatar_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PublicAvatarPreviewPreference` ADD CONSTRAINT `PublicAvatarPreviewPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PublicAvatarPreviewPreference` ADD CONSTRAINT `PublicAvatarPreviewPreference_previewCacheId_fkey` FOREIGN KEY (`previewCacheId`) REFERENCES `PublicAvatarPreviewCache`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_avatarId_fkey` FOREIGN KEY (`avatarId`) REFERENCES `Avatar`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_scriptId_fkey` FOREIGN KEY (`scriptId`) REFERENCES `Script`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_productionPlanId_fkey` FOREIGN KEY (`productionPlanId`) REFERENCES `VideoProductionPlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoTask` ADD CONSTRAINT `VideoTask_packagingTemplateId_fkey` FOREIGN KEY (`packagingTemplateId`) REFERENCES `VideoPackagingTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_structureId_fkey` FOREIGN KEY (`structureId`) REFERENCES `VideoStructure`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `VideoProductionPlan` ADD CONSTRAINT `VideoProductionPlan_packagingTemplateId_fkey` FOREIGN KEY (`packagingTemplateId`) REFERENCES `VideoPackagingTemplate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

