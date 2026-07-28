import { describe, expect, it } from "vitest"
import {
  BUSINESS_ATTRIBUTION_FIELD_NAMES,
  checkBusinessAttributionFieldContract,
} from "@/lib/aim/business-attribution-field-contract"
import { BUSINESS_ATTRIBUTION_FIELD_FIXTURE } from "@/lib/aim/fixtures/business-attribution-fields"

describe("business attribution field contract", () => {
  it("fixture 与契约清单一致（漂移骨架，无密钥不调真 API）", () => {
    expect([...BUSINESS_ATTRIBUTION_FIELD_FIXTURE]).toEqual([...BUSINESS_ATTRIBUTION_FIELD_NAMES])
    const result = checkBusinessAttributionFieldContract(BUSINESS_ATTRIBUTION_FIELD_FIXTURE)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it("缺少关键字段时失败并列出 missing", () => {
    const incomplete = BUSINESS_ATTRIBUTION_FIELD_NAMES.filter((name) => name !== "归因方式")
    const result = checkBusinessAttributionFieldContract(incomplete)
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(["归因方式"])
  })

  it("多出来的字段记入 extra 但不失败", () => {
    const result = checkBusinessAttributionFieldContract([
      ...BUSINESS_ATTRIBUTION_FIELD_NAMES,
      "备注",
    ])
    expect(result.ok).toBe(true)
    expect(result.extra).toEqual(["备注"])
  })
})
