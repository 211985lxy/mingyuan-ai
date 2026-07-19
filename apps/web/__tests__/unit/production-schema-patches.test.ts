import { describe, expect, it } from "vitest"
import { PRODUCTION_SCHEMA_PATCHES } from "../../scripts/apply-production-schema-patches.mjs"

describe("production schema patches", () => {
  it("repairs the user auth video column idempotently", () => {
    expect(PRODUCTION_SCHEMA_PATCHES).toContain(
      "ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `authVideoUrl` VARCHAR(191) NULL",
    )
  })

  it("repairs execution trace telemetry columns idempotently", () => {
    const tracePatch = PRODUCTION_SCHEMA_PATCHES.find((patch) =>
      patch.startsWith("ALTER TABLE `AimExecutionTrace`"),
    )

    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `inputTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `outputTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `cachedTokens` INTEGER NULL")
    expect(tracePatch).toContain("ADD COLUMN IF NOT EXISTS `costCny` DECIMAL(10,6) NULL")
  })
})
