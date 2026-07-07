import { describe, expect, it } from "vitest"
import { sourcesForEmail } from "@/lib/account-industry-sources"
import { mergeAccountSourceBindings } from "@/lib/hot-source-settings"

describe("hot source settings", () => {
  it("lets system settings override built-in sources for the same account", () => {
    const bindings = mergeAccountSourceBindings([
      {
        email: "957739245@qq.com",
        sources: [
          {
            source_name: "后台信源",
            source_url: "/hot-sources/custom/items.json",
            status: "active",
          },
        ],
      },
    ])

    expect(sourcesForEmail(bindings, "957739245@qq.com")).toEqual([
      {
        source_name: "后台信源",
        source_url: "/hot-sources/custom/items.json",
        status: "active",
      },
    ])
  })
})
