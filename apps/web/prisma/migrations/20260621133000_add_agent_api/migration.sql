CREATE TABLE `AgentApiKey` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `keyPrefix` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `allowedProjects` JSON NOT NULL,
  `allowedAgents` JSON NOT NULL,
  `dailyLimit` INTEGER NOT NULL DEFAULT 50,
  `lastUsedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `AgentApiKey_keyHash_key`(`keyHash`),
  INDEX `AgentApiKey_userId_status_idx`(`userId`, `status`),
  INDEX `AgentApiKey_keyPrefix_idx`(`keyPrefix`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentApiCallLog` (
  `id` VARCHAR(191) NOT NULL,
  `apiKeyId` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NULL,
  `projectId` VARCHAR(191) NULL,
  `agentId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `inputSummary` TEXT NULL,
  `outputFormats` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `errorMessage` TEXT NULL,
  `durationMs` INTEGER NULL,
  `aimGenerationId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `AgentApiCallLog_apiKeyId_createdAt_idx`(`apiKeyId`, `createdAt`),
  INDEX `AgentApiCallLog_userId_createdAt_idx`(`userId`, `createdAt`),
  INDEX `AgentApiCallLog_status_createdAt_idx`(`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentApiKey`
  ADD CONSTRAINT `AgentApiKey_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AgentApiCallLog`
  ADD CONSTRAINT `AgentApiCallLog_apiKeyId_fkey`
  FOREIGN KEY (`apiKeyId`) REFERENCES `AgentApiKey`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `AgentApiCallLog`
  ADD CONSTRAINT `AgentApiCallLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
