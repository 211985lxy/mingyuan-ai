-- KnowledgeChunk：把检索单元从 KnowledgeEntry 下沉到带重叠的细粒度块
--
-- 背景：导入侧 CHUNK_THRESHOLD = 5000，嵌入侧 BGE 只取前 500 字，
-- 导致长条目的绝大部分内容从未进入向量空间。详见 src/lib/llm/chunking.ts 顶部注释。
--
-- 设计说明：
-- 1. embedding 用 LONGBLOB 存 Float32Array 原始字节（1024 维 = 4KB），
--    相比 JSON 文本（约 11KB）省约 64%，且免去 JSON.parse 开销。
--    编解码见 src/lib/llm/knowledge-chunk-index.ts 的 encodeVector / decodeVector。
-- 2. 不修改 KnowledgeEmbedding 表 —— 旧路径完整保留，便于一键回退。
-- 3. 本迁移不含 FULLTEXT 索引：中文全文检索必须用 ngram 解析器，而生产库
--    （MariaDB 10.5）不支持，P1 的词面召回因此刻意停用。
--    决策记录、现状影响与补救路径见 20260916160000 迁移的文件头。
--
-- 回滚：DROP TABLE `KnowledgeChunk`;  （无其他表受影响）

CREATE TABLE `KnowledgeChunk` (
  `id` VARCHAR(191) NOT NULL,
  `entryId` VARCHAR(191) NOT NULL,
  `idx` INTEGER NOT NULL,
  `text` TEXT NOT NULL,
  `embedding` LONGBLOB NULL,
  `dimensions` INTEGER NOT NULL DEFAULT 1024,
  `model` VARCHAR(191) NOT NULL DEFAULT 'BAAI/bge-large-zh-v1.5',
  `contentHash` VARCHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `KnowledgeChunk_entryId_idx_key`(`entryId`, `idx`),
  INDEX `KnowledgeChunk_entryId_idx`(`entryId`),
  INDEX `KnowledgeChunk_status_idx`(`status`),
  INDEX `KnowledgeChunk_contentHash_idx`(`contentHash`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `KnowledgeChunk` ADD CONSTRAINT `KnowledgeChunk_entryId_fkey`
  FOREIGN KEY (`entryId`) REFERENCES `KnowledgeEntry`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 存量重建索引提示：chunk 行按 entryId 批量写入，
-- 重建完成后建议 ANALYZE TABLE 让优化器拿到真实基数。
-- ANALYZE TABLE `KnowledgeChunk`;
