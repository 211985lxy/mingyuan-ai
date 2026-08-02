import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { requireTestDatabaseUrl } from "../../scripts/e2e-database"

const baselineMigrations = JSON.parse(
  readFileSync(resolve(process.cwd(), "prisma/baseline/migrations.json"), "utf8"),
) as string[]

describe("E2E database safety", () => {
  it("accepts only MySQL-compatible URLs with an explicit test database segment", () => {
    expect(requireTestDatabaseUrl("mysql://root:secret@127.0.0.1:3306/mingyuan_test"))
      .toBe("mysql://root:secret@127.0.0.1:3306/mingyuan_test")
    expect(requireTestDatabaseUrl("mariadb://root:secret@127.0.0.1/test-mingyuan"))
      .toBe("mariadb://root:secret@127.0.0.1/test-mingyuan")
  })

  it.each([
    [undefined, "TEST_DATABASE_URL is required"],
    ["postgresql://root:secret@127.0.0.1/mingyuan_test", "must use mysql:// or mariadb://"],
    ["mysql://root:secret@127.0.0.1/mingyuan", "Refusing to reset database"],
  ])("rejects unsafe database URL %s", (databaseUrl, message) => {
    expect(() => requireTestDatabaseUrl(databaseUrl)).toThrow(message)
  })

  it("keeps the immutable baseline migration list valid and duplicate-free", () => {
    expect(new Set(baselineMigrations).size).toBe(baselineMigrations.length)
    expect(baselineMigrations.at(-1)).toBe("20260731120000_add_video_structure_extraction_fields")
    expect(baselineMigrations).toContain("20260713130000_add_admin_session_version")

    for (const migration of baselineMigrations) {
      expect(() => readFileSync(resolve(process.cwd(), "prisma/migrations", migration, "migration.sql")))
        .not.toThrow()
    }
  })
})
