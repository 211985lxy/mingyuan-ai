-- Create KnowledgeEmbedding table for lightweight semantic retrieval
-- Stores embedding vectors as JSON alongside metadata for content-hash-based cache invalidation.

CREATE TABLE `KnowledgeEmbedding` (
  `id` VARCHAR(191) NOT NULL,
  `entryId` VARCHAR(191) NOT NULL,
  `embedding` JSON NOT NULL,
  `dimensions` INT NOT NULL DEFAULT 1536,
  `model` VARCHAR(191) NOT NULL,
  `contentHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `KnowledgeEmbedding_entryId_key`(`entryId`),
  INDEX `KnowledgeEmbedding_status_idx`(`status`),
  INDEX `KnowledgeEmbedding_contentHash_idx`(`contentHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `KnowledgeEmbedding` ADD CONSTRAINT `KnowledgeEmbedding_entryId_fkey`
  FOREIGN KEY (`entryId`) REFERENCES `KnowledgeEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Approx token usage for the 7.1MB Obsidian corpus:
--   ~2.5M chars → ~650k tokens at 4 chars/token (Chinese avg)
--   At ~$0.13/1M tokens (text-embedding-3-small) → ~$0.08 one-time
--   Per-entry embedding is ~tens of tokens → negligible daily cost
