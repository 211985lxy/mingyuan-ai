ALTER TABLE `TopicSelection` ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `TopicSelection_projectId_createdAt_idx`
ON `TopicSelection`(`projectId`, `createdAt`);

ALTER TABLE `TopicSelection`
ADD CONSTRAINT `TopicSelection_projectId_fkey`
FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
