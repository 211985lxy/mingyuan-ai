import { describe, expect, it } from "vitest"
import {
  checkOperatingCohortFieldContract,
  OPERATING_COHORT_FIELD_NAMES,
} from "@/lib/aim/operating-cohort-field-contract"
import {
  OPERATING_COHORT_FIELD_FIXTURE,
} from "@/lib/aim/fixtures/operating-cohort-fields"

describe("operating cohort Feishu field contract", () => {
  it("fixture 与只读字段契约保持一致", () => {
    expect(OPERATING_COHORT_FIELD_FIXTURE).toEqual(OPERATING_COHORT_FIELD_NAMES)
    expect(checkOperatingCohortFieldContract(OPERATING_COHORT_FIELD_FIXTURE)).toEqual({
      ok: true,
      missing: [],
      extra: [],
    })
  })

  it("缺少任一分群或周期字段时 fail closed", () => {
    const fields = OPERATING_COHORT_FIELD_NAMES.filter(
      (name) => name !== "问题紧迫度" && name !== "成交发生时间",
    )
    expect(checkOperatingCohortFieldContract(fields)).toMatchObject({
      ok: false,
      missing: ["问题紧迫度", "成交发生时间"],
    })
  })
})
