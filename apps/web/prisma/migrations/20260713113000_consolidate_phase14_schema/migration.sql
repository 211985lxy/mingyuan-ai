-- Consolidate the schema changes that were previously applied through
-- /api/admin/migrate. Each statement tolerates databases where that route was
-- already used, while normalizing column types to the Prisma schema.

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ContentGenerationRun'
      AND COLUMN_NAME = 'topicSelectionId'
  ),
  'ALTER TABLE `ContentGenerationRun` MODIFY COLUMN `topicSelectionId` VARCHAR(191) NULL',
  'ALTER TABLE `ContentGenerationRun` ADD COLUMN `topicSelectionId` VARCHAR(191) NULL'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ContentGenerationRun'
      AND COLUMN_NAME = 'openingTypeCode'
  ),
  'ALTER TABLE `ContentGenerationRun` MODIFY COLUMN `openingTypeCode` VARCHAR(191) NULL',
  'ALTER TABLE `ContentGenerationRun` ADD COLUMN `openingTypeCode` VARCHAR(191) NULL'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ContentGenerationRun'
      AND COLUMN_NAME = 'copyStructureCode'
  ),
  'ALTER TABLE `ContentGenerationRun` MODIFY COLUMN `copyStructureCode` VARCHAR(191) NULL',
  'ALTER TABLE `ContentGenerationRun` ADD COLUMN `copyStructureCode` VARCHAR(191) NULL'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ContentGenerationRun'
      AND COLUMN_NAME = 'endingTypeCode'
  ),
  'ALTER TABLE `ContentGenerationRun` MODIFY COLUMN `endingTypeCode` VARCHAR(191) NULL',
  'ALTER TABLE `ContentGenerationRun` ADD COLUMN `endingTypeCode` VARCHAR(191) NULL'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'ContentGenerationRun'
      AND INDEX_NAME = 'ContentGenerationRun_topicSelectionId_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `ContentGenerationRun_topicSelectionId_idx` ON `ContentGenerationRun`(`topicSelectionId`)'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Script'
      AND COLUMN_NAME = 'topicSelectionId'
  ),
  'ALTER TABLE `Script` MODIFY COLUMN `topicSelectionId` VARCHAR(191) NULL',
  'ALTER TABLE `Script` ADD COLUMN `topicSelectionId` VARCHAR(191) NULL'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Script'
      AND COLUMN_NAME = 'isHotTopicVersion'
  ),
  'SELECT 1',
  'ALTER TABLE `Script` ADD COLUMN `isHotTopicVersion` BOOLEAN NOT NULL DEFAULT false'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

UPDATE `Script`
SET `isHotTopicVersion` = false
WHERE `isHotTopicVersion` IS NULL;

ALTER TABLE `Script`
  MODIFY COLUMN `isHotTopicVersion` BOOLEAN NOT NULL DEFAULT false;

SET @migration_sql = IF(
  EXISTS(
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Script'
      AND INDEX_NAME = 'Script_topicSelectionId_idx'
  ),
  'SELECT 1',
  'CREATE INDEX `Script_topicSelectionId_idx` ON `Script`(`topicSelectionId`)'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
