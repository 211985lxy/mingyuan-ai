-- AlterTable: 新增价值分级列（S/A/B/C），nullable，存量数据视为 B
ALTER TABLE `KnowledgeEntry` ADD COLUMN `valueGrade` VARCHAR(2) NULL;

-- CreateIndex: 支持按等级筛选
CREATE INDEX `KnowledgeEntry_userId_valueGrade_idx` ON `KnowledgeEntry`(`userId`, `valueGrade`);
