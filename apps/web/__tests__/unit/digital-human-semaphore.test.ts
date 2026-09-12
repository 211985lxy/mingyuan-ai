import { describe, expect, it } from "vitest"
import {
  providerMaxConcurrent,
  providerSemaphoreKey,
} from "@/lib/digital-human-semaphore"

describe("digital-human provider semaphore", () => {
  it("uses independent Redis keys", () => {
    expect(providerSemaphoreKey("chanjing")).not.toBe(providerSemaphoreKey("shanjian"))
    expect(providerSemaphoreKey("chanjing")).toBe("digital-human:chanjing:inflight")
  })

  it("defaults Chanjing to the conservative single-task limit", () => {
    expect(providerMaxConcurrent("chanjing")).toBe(1)
  })
})
