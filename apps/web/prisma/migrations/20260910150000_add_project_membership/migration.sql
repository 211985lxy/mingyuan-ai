-- Let multiple login accounts select the same active client project.
-- Existing owner and account bindings are preserved as explicit memberships.

DROP INDEX `User_boundProjectId_key` ON `User`;

CREATE INDEX `User_boundProjectId_idx` ON `User`(`boundProjectId`);

CREATE TABLE `ProjectMember` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` VARCHAR(24) NOT NULL DEFAULT 'member',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ProjectMember_projectId_userId_key`(`projectId`, `userId`),
  INDEX `ProjectMember_userId_projectId_idx`(`userId`, `projectId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProjectMember_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `ClientProject`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ProjectMember_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Project owners have owner membership even when no login binding exists yet.
INSERT IGNORE INTO `ProjectMember` (`id`, `projectId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT CONCAT('project-owner-', `id`), `id`, `userId`, 'owner', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `ClientProject`;

-- Preserve any existing account selections, including accounts selecting a project
-- owned by a different account after manual repair.
INSERT IGNORE INTO `ProjectMember` (`id`, `projectId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT CONCAT('project-member-', `id`, '-', `boundProjectId`), `boundProjectId`, `id`, 'member', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `boundProjectId` IS NOT NULL;
