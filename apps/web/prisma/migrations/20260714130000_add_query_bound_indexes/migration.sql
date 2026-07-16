CREATE INDEX `KnowledgeEntry_userId_status_projectId_sortOrder_createdAt_idx`
  ON `KnowledgeEntry`(`userId`, `status`, `projectId`, `sortOrder`, `createdAt` DESC);

CREATE INDEX `TopicSelection_userId_createdAt_idx`
  ON `TopicSelection`(`userId`, `createdAt` DESC);

CREATE INDEX `ClientProject_userId_status_updatedAt_idx`
  ON `ClientProject`(`userId`, `status`, `updatedAt` DESC);

CREATE INDEX `Asset_userId_createdAt_idx`
  ON `Asset`(`userId`, `createdAt` DESC);
