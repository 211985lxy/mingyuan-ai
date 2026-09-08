import { describe, expect, it } from "vitest"
import { PROMPT_SEEDS } from "@/lib/prompt/seeds"
import { AIM_AGENTS_PROMPT_SEEDS } from "@/lib/prompt/seeds-aim-agents"
import { AIM_SERVICES_PROMPT_SEEDS } from "@/lib/prompt/seeds-aim-services"
import { QUALITY_GATE_PROMPT_SEEDS } from "@/lib/prompt/seeds-quality-gate"
import { API_ROUTES_PROMPT_SEEDS } from "@/lib/prompt/seeds-api-routes"

describe("seeds probe", () => {
  it("lengths", () => {
    console.log("PROMPT_SEEDS:", PROMPT_SEEDS.length)
    console.log("agents:", AIM_AGENTS_PROMPT_SEEDS.length)
    console.log("services:", AIM_SERVICES_PROMPT_SEEDS.length)
    console.log("quality:", QUALITY_GATE_PROMPT_SEEDS.length)
    console.log("api:", API_ROUTES_PROMPT_SEEDS.length)
    expect(PROMPT_SEEDS.length).toBe(41)
  })
})
