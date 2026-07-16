import { describe, expect, it } from "vitest"
import { safeMarkdownHref } from "@/components/markdown-renderer"
import { isPrivateIpAddress } from "@/app/api/proxy-image/proxy-image-utils"

describe("web input security", () => {
  it("rejects executable and data Markdown links", () => {
    expect(safeMarkdownHref("javascript:alert(1)")).toBeNull()
    expect(safeMarkdownHref("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(safeMarkdownHref("https://example.com/a")).toBe("https://example.com/a")
  })

  it("recognizes private and loopback IP addresses", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true)
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true)
    expect(isPrivateIpAddress("192.168.1.4")).toBe(true)
    expect(isPrivateIpAddress("::1")).toBe(true)
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false)
  })
})
