import { describe, expect, it } from "vitest"
import { sanitizeErrorForUser } from "@/lib/competitor-analysis/pipeline"

describe("sanitizeErrorForUser", () => {
  it("keeps actionable collection setup errors", () => {
    expect(sanitizeErrorForUser(new Error("未配置真实对标账号抓取服务：请配置 TIKHUB_API_KEY"))).toContain("未配置真实对标账号抓取服务")
    expect(sanitizeErrorForUser(new Error("AccessDenied"))).toContain("数据采集服务权限失败")
  })
})
