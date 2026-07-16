import { describe, expect, it } from "vitest"

import { findUnboundedFindMany } from "../../scripts/check-prisma-query-bounds.mjs"

describe("Prisma query bounds guard", () => {
  it("accepts a findMany call with an explicit hard bound", () => {
    expect(findUnboundedFindMany("prisma.project.findMany({ where: {}, take: 100 })")).toEqual([])
  })

  it("rejects missing and implicit findMany options", () => {
    expect(findUnboundedFindMany("prisma.project.findMany({ where: {} })")).toHaveLength(1)
    expect(findUnboundedFindMany("prisma.project.findMany(options)")).toHaveLength(1)
    expect(findUnboundedFindMany("prisma.project.findMany()")).toHaveLength(1)
  })
})
