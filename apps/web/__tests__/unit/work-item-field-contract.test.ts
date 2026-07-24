import { describe, expect, it } from "vitest"

import {
  WORK_ITEM_REQUIRED_PRODUCTION_FIELDS,
  assertDispatchFieldsInContract,
  checkWorkItemFieldContract,
} from "@/lib/aim/work-item-field-contract"
import { DISPATCH_FIELDS, SUPERVISION_FIELDS } from "@/lib/aim/work-item-dispatch"

describe("work-item field contract", () => {
  it("DISPATCH / SUPERVISION 常量全部纳入生产契约", () => {
    expect(() => assertDispatchFieldsInContract()).not.toThrow()
    for (const name of Object.values(DISPATCH_FIELDS)) {
      expect(WORK_ITEM_REQUIRED_PRODUCTION_FIELDS).toContain(name)
    }
    for (const name of Object.values(SUPERVISION_FIELDS)) {
      expect(WORK_ITEM_REQUIRED_PRODUCTION_FIELDS).toContain(name)
    }
  })

  it("完整字段集合检查通过", () => {
    const result = checkWorkItemFieldContract(WORK_ITEM_REQUIRED_PRODUCTION_FIELDS)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it("缺少调度字段时失败并列出 missing", () => {
    const incomplete = WORK_ITEM_REQUIRED_PRODUCTION_FIELDS.filter(
      (name) => name !== DISPATCH_FIELDS.leaseUntil,
    )
    const result = checkWorkItemFieldContract(incomplete)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain(DISPATCH_FIELDS.leaseUntil)
  })
})
