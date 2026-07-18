-- CreateIndex
CREATE INDEX `KnowledgeEntry_userId_status_projectId_category_valueGrade_u_idx` ON `KnowledgeEntry`(`userId`, `status`, `projectId`, `category`, `valueGrade`, `updatedAt` DESC);
