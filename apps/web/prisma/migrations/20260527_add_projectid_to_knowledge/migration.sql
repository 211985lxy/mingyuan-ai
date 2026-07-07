-- AlterTable
ALTER TABLE `KnowledgeEntry` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `KnowledgeEntry_projectId_idx` ON `KnowledgeEntry`(`projectId`);

-- AddForeignKey
ALTER TABLE `KnowledgeEntry` ADD CONSTRAINT `KnowledgeEntry_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;