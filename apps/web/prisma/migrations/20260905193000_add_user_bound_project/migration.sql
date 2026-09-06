-- Bind each AIM login account to at most one active IP/client project.
ALTER TABLE `User`
  ADD COLUMN `boundProjectId` VARCHAR(191) NULL,
  ADD COLUMN `projectBoundAt` DATETIME(3) NULL,
  ADD COLUMN `projectBindingSource` VARCHAR(24) NULL;

CREATE UNIQUE INDEX `User_boundProjectId_key` ON `User`(`boundProjectId`);

ALTER TABLE `User`
  ADD CONSTRAINT `User_boundProjectId_fkey`
  FOREIGN KEY (`boundProjectId`) REFERENCES `ClientProject`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
