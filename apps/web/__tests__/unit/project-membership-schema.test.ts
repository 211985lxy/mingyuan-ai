import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const appRoot = path.resolve(__dirname, "../..")

describe("shared project membership schema", () => {
  it("allows several accounts to select one project while preserving a membership record", () => {
    const identity = readFileSync(path.join(appRoot, "prisma/identity.prisma"), "utf8")
    const profiles = readFileSync(path.join(appRoot, "prisma/profiles.prisma"), "utf8")

    expect(identity).toMatch(/boundProjectId\s+String\?(?!\s+@unique)/)
    expect(identity).toMatch(/projectMemberships\s+ProjectMember\[\]/)
    expect(profiles).toMatch(/boundAccounts\s+User\[\]/)
    expect(profiles).toMatch(/members\s+ProjectMember\[\]/)
    expect(profiles).toContain("model ProjectMember")
    expect(profiles).toContain("@@unique([projectId, userId])")
  })

  it("migrates the old one-account-per-project index and backfills members", () => {
    const migration = readFileSync(
      path.join(appRoot, "prisma/migrations/20260910150000_add_project_membership/migration.sql"),
      "utf8",
    )

    expect(migration).toContain("DROP INDEX `User_boundProjectId_key` ON `User`")
    expect(migration).toContain("DROP FOREIGN KEY `User_boundProjectId_fkey`")
    expect(migration.indexOf("DROP FOREIGN KEY `User_boundProjectId_fkey`")).toBeLessThan(
      migration.indexOf("DROP INDEX `User_boundProjectId_key` ON `User`"),
    )
    expect(migration).toContain("ADD CONSTRAINT `User_boundProjectId_fkey`")
    expect(migration).toContain("CREATE TABLE `ProjectMember`")
    expect(migration).toContain("INSERT IGNORE INTO `ProjectMember`")
  })
})
