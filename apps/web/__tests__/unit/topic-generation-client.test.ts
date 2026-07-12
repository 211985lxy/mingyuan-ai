import { expect, it } from "vitest"
import { TOPIC_GENERATE_TIMEOUT_MS } from "@/lib/api/client"

it("keeps the daily topic request alive through provider fallback", () => {
  expect(TOPIC_GENERATE_TIMEOUT_MS).toBe(180000)
})
