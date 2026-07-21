-- AlterTable: add routing target + default agent to channel bindings
ALTER TABLE `ChannelBinding` ADD COLUMN `routeTarget` VARCHAR(16) NOT NULL DEFAULT 'topic',
                               ADD COLUMN `defaultAgentId` VARCHAR(40) NULL;

-- CreateTable: AIM agent conversation bound to one chat + agent
CREATE TABLE `AimConversation` (
    `id` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `projectId` VARCHAR(30) NOT NULL,
    `platform` VARCHAR(40) NOT NULL,
    `externalChatId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(40) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AimConversation_platform_externalChatId_agentId_key`(`platform`, `externalChatId`, `agentId`),
    INDEX `AimConversation_userId_updatedAt_idx`(`userId`, `updatedAt`),
    INDEX `AimConversation_projectId_updatedAt_idx`(`projectId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: a single turn in an AIM channel conversation
CREATE TABLE `AimConversationMessage` (
    `id` VARCHAR(30) NOT NULL,
    `conversationId` VARCHAR(30) NOT NULL,
    `role` VARCHAR(16) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `agentId` VARCHAR(40) NOT NULL,
    `externalMessageId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `aimGenerationId` VARCHAR(40) NULL,
    `resultSummary` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'completed',
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AimConversationMessage_dedupeKey_key`(`dedupeKey`),
    INDEX `AimConversationMessage_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `AimConversationMessage_agentId_createdAt_idx`(`agentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AimConversationMessage` ADD CONSTRAINT `AimConversationMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AimConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
