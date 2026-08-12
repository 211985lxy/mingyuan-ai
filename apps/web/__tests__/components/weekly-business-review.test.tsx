import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { WeeklyBusinessReview } from "@/features/aim/components/weekly-business-review"

describe("WeeklyBusinessReview", () => {
  it("shows real business metrics and preserves unknown values", () => {
    render(<WeeklyBusinessReview review={{
      periodStart: "2026-08-05T00:00:00.000Z", periodEnd: "2026-08-12T00:00:00.000Z",
      publishedCount: 4, qualifiedLeadCount: 3, appointmentCount: 1,
      dealCount: null, revenue: null, referencedAssetCount: 2, reusedAssetCount: 1,
      day7Backfill: { due: 4, filled: 3 },
    }} />)
    expect(screen.getByText("有效线索")).toBeInTheDocument()
    expect(screen.getAllByText("待回填").length).toBeGreaterThan(0)
    expect(screen.getByText("75%")).toBeInTheDocument()
  })
})
