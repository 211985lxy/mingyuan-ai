import { describe, expect, it } from "vitest"
import { PRODUCTION_SCHEMA_PATCHES } from "../../scripts/apply-production-schema-patches.mjs"

describe("production schema patches", () => {
  it("repairs the user auth video column idempotently", () => {
    expect(PRODUCTION_SCHEMA_PATCHES).toContain(
      "ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `authVideoUrl` VARCHAR(191) NULL",
    )
  })
})
