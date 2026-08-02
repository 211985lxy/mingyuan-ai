-- WP-0 repair: keep the legacy userVerdict untouched and add the canonical note field.
-- Guard each additive change through information_schema for MySQL compatibility.
SET @verdict_code_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ContentOutcome'
    AND COLUMN_NAME = 'verdictCode'
);
SET @verdict_code_sql = IF(
  @verdict_code_exists = 0,
  'ALTER TABLE `ContentOutcome` ADD COLUMN `verdictCode` VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE verdict_code_stmt FROM @verdict_code_sql;
EXECUTE verdict_code_stmt;
DEALLOCATE PREPARE verdict_code_stmt;

SET @verdict_note_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ContentOutcome'
    AND COLUMN_NAME = 'verdictNote'
);
SET @verdict_note_sql = IF(
  @verdict_note_exists = 0,
  'ALTER TABLE `ContentOutcome` ADD COLUMN `verdictNote` TEXT NULL',
  'SELECT 1'
);
PREPARE verdict_note_stmt FROM @verdict_note_sql;
EXECUTE verdict_note_stmt;
DEALLOCATE PREPARE verdict_note_stmt;
