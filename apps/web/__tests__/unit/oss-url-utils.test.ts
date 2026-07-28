import { describe, expect, it } from "vitest"

import {
  assertPublicSourceUrl,
  inferContentTypeFromKey,
  inferUrlExpiry,
} from "@/lib/oss/url-utils"

describe("OSS URL utilities", () => {
  it("rejects loopback and private-network source URLs", () => {
    expect(() => assertPublicSourceUrl("http://localhost/file")).toThrow("blocked host")
    expect(() => assertPublicSourceUrl("http://127.0.0.1/file")).toThrow("blocked internal ip")
    expect(() => assertPublicSourceUrl("http://192.168.1.2/file")).toThrow("blocked internal ip")
    expect(() => assertPublicSourceUrl("https://example.com/file")).not.toThrow()
  })

  it("preserves content-type inference", () => {
    expect(inferContentTypeFromKey("video/demo.mp4")).toBe("video/mp4")
    expect(inferContentTypeFromKey("image/demo.JPEG")).toBe("image/jpeg")
    expect(inferContentTypeFromKey("files/demo.bin")).toBeNull()
  })

  it("parses second and millisecond expiry values", () => {
    expect(inferUrlExpiry("https://example.com/a?Expires=2000000000")?.toISOString())
      .toBe("2033-05-18T03:33:20.000Z")
    expect(inferUrlExpiry("https://example.com/a?expires=2000000000000")?.toISOString())
      .toBe("2033-05-18T03:33:20.000Z")
  })
})
