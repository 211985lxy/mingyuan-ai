import { describe, expect, it } from "vitest"
import { readLoopRuntimeConfig } from "@/lib/aim/loop-runtime-config"

describe("loop runtime config", () => {
  it("默认关闭且默认为影子模式", () => {
    expect(readLoopRuntimeConfig({})).toMatchObject({
      enabled: false,
      shadowMode: true,
      operatingMode: "shadow",
    })
  })

  it("启用时必须显式指定试点项目", () => {
    expect(() => readLoopRuntimeConfig({ AIM_BUSINESS_LOOPS_ENABLED: "true" }))
      .toThrow("AIM_LOOP_PILOT_PROJECT_IDS")
  })

  it("解析去重后的项目白名单并允许显式关闭影子模式", () => {
    const config = readLoopRuntimeConfig({
      AIM_BUSINESS_LOOPS_ENABLED: "true",
      AIM_LOOP_SHADOW_MODE: "false",
      AIM_LOOP_OPERATING_MODE: "assisted",
      AIM_LOOP_PILOT_PROJECT_IDS: "proj_1, proj_2,proj_1",
    })
    expect(config.shadowMode).toBe(false)
    expect(config.operatingMode).toBe("assisted")
    expect([...config.pilotProjectIds]).toEqual(["proj_1", "proj_2"])
  })

  it("正式自动 supervised_auto", () => {
    const config = readLoopRuntimeConfig({
      AIM_BUSINESS_LOOPS_ENABLED: "true",
      AIM_LOOP_SHADOW_MODE: "false",
      AIM_LOOP_OPERATING_MODE: "supervised_auto",
      AIM_LOOP_PILOT_PROJECT_IDS: "proj_a",
    })
    expect(config.operatingMode).toBe("supervised_auto")
  })

  it("拒绝 low_risk_auto", () => {
    expect(() =>
      readLoopRuntimeConfig({
        AIM_BUSINESS_LOOPS_ENABLED: "true",
        AIM_LOOP_SHADOW_MODE: "false",
        AIM_LOOP_OPERATING_MODE: "low_risk_auto",
        AIM_LOOP_PILOT_PROJECT_IDS: "proj_a",
      }),
    ).toThrow(/low_risk_auto/)
  })
})
