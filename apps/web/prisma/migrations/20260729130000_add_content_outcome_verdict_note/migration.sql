-- WP-0 repair: keep the legacy userVerdict untouched and add the canonical note field.
ALTER TABLE `ContentOutcome`
  ADD COLUMN IF NOT EXISTS `verdictCode` VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `verdictNote` TEXT NULL;
