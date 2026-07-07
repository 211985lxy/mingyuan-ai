import { NextResponse } from "next/server"
import {
  ContentScenario,
  SCENARIO_LABELS,
  getScenarioConfig,
} from "@/lib/content-scenario-config"

export async function GET() {
  const scenarios = Object.keys(SCENARIO_LABELS) as ContentScenario[]
  return NextResponse.json({
    scenarios: scenarios.map((id) => ({
      id,
      label: SCENARIO_LABELS[id],
      qualityFocus: getScenarioConfig(id).qualityFocus,
    })),
  })
}
