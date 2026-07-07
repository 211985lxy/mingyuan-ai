-- CreateTable: 知识实体（轻量知识图谱节点，借鉴 Cognee cognify 管道）
CREATE TABLE `KnowledgeEntity` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `aliases` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `KnowledgeEntity_userId_projectId_name_type_key`(`userId`, `projectId`, `name`, `type`),
    INDEX `KnowledgeEntity_projectId_status_idx`(`projectId`, `status`),
    INDEX `KnowledgeEntity_userId_name_idx`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 知识关系（实体-关系三元组，可溯源到知识条目）
CREATE TABLE `KnowledgeRelation` (
    `id` VARCHAR(191) NOT NULL,
    `fromEntityId` VARCHAR(191) NOT NULL,
    `toEntityId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 1.0,
    `evidence` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `KnowledgeRelation_fromEntityId_toEntityId_entryId_type_key`(`fromEntityId`, `toEntityId`, `entryId`, `type`),
    INDEX `KnowledgeRelation_fromEntityId_type_idx`(`fromEntityId`, `type`),
    INDEX `KnowledgeRelation_entryId_idx`(`entryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: AIM 智能体持久化记忆
CREATE TABLE `AimMemory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `agentId` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `content` TEXT NOT NULL,
    `entityIds` JSON NOT NULL,
    `sourceGenerationId` VARCHAR(191) NULL,
    `relevance` DOUBLE NOT NULL DEFAULT 1.0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AimMemory_userId_projectId_agentId_idx`(`userId`, `projectId`, `agentId`),
    INDEX `AimMemory_userId_projectId_kind_idx`(`userId`, `projectId`, `kind`),
    INDEX `AimMemory_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `KnowledgeEntity` ADD CONSTRAINT `KnowledgeEntity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `KnowledgeEntity` ADD CONSTRAINT `KnowledgeEntity_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_fromEntityId_fkey` FOREIGN KEY (`fromEntityId`) REFERENCES `KnowledgeEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_toEntityId_fkey` FOREIGN KEY (`toEntityId`) REFERENCES `KnowledgeEntity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `KnowledgeRelation` ADD CONSTRAINT `KnowledgeRelation_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `KnowledgeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AimMemory` ADD CONSTRAINT `AimMemory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AimMemory` ADD CONSTRAINT `AimMemory_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
