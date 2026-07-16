import { describe, expect, it } from "vitest"
import { readWorkItemStoreConfig } from "@/lib/aim/work-item-store"

const VALID_ENV = {
  LARK_BASE_TOKEN: "base_1",
  LARK_WORK_ITEM_TABLE_ID: "table_1",
  LARK_CLI_PATH: "/usr/local/bin/lark-cli",
}

describe("readWorkItemStoreConfig", () => {
  it("reads the complete Feishu work-item configuration", () => {
    expect(readWorkItemStoreConfig(VALID_ENV)).toEqual({
      baseToken: "base_1",
      tableId: "table_1",
      cliPath: "/usr/local/bin/lark-cli",
    })
  })

  it.each([
    ["LARK_BASE_TOKEN", "LARK_BASE_TOKEN"],
    ["LARK_WORK_ITEM_TABLE_ID", "LARK_WORK_ITEM_TABLE_ID"],
    ["LARK_CLI_PATH", "LARK_CLI_PATH"],
  ] as const)("fails closed when %s is missing", (key, message) => {
    expect(() => readWorkItemStoreConfig({ ...VALID_ENV, [key]: "" })).toThrow(message)
  })
})
