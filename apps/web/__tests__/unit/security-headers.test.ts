import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

describe("web security headers", () => {
  it("applies the required browser security policy to every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function")
    const rules = await nextConfig.headers!()
    const allRoutes = rules.find((rule) => rule.source === "/:path*")
    const headers = new Map(allRoutes?.headers.map((item) => [item.key, item.value]))

    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'")
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=31536000")
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(headers.get("X-Frame-Options")).toBe("DENY")
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()")
  })
})
