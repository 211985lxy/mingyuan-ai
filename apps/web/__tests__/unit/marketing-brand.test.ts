import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_LEGAL_ENTITY,
  MARKETING_PRIMARY_CTA,
  MARKETING_PRODUCT_NAME,
  MARKETING_WECHAT_QR_PATH,
} from "@/lib/marketing-brand"

describe("marketing brand hierarchy", () => {
  it("keeps company and product names distinct", () => {
    expect(MARKETING_COMPANY_NAME).toBe("明动远见")
    expect(MARKETING_PRODUCT_NAME).toBe("明远 AIM")
    expect(MARKETING_LEGAL_ENTITY).toContain("杭州宇米教育科技有限公司")
    expect(MARKETING_PRIMARY_CTA).toBe("添加微信，预约诊断")
  })

  it("points WeChat QR to a real public asset", () => {
    expect(MARKETING_WECHAT_QR_PATH).toBe("/marketing/wechat-qr.png")
    const filePath = path.join(
      process.cwd(),
      "public",
      "marketing",
      "wechat-qr.png",
    )
    expect(existsSync(filePath)).toBe(true)
  })
})
