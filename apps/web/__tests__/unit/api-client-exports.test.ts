import { describe, expect, it } from "vitest"
import * as aim from "@/lib/api/aim"
import * as competitor from "@/lib/api/competitor"
import * as topics from "@/lib/api/topics"
import {
  generateAimContent,
  getCompetitorAnalysis,
  getTodayTopics,
} from "@/lib/api/client"

describe("api client compatibility barrel", () => {
  it("keeps domain calls available from the legacy client path", () => {
    expect(generateAimContent).toBe(aim.generateAimContent)
    expect(getTodayTopics).toBe(topics.getTodayTopics)
    expect(getCompetitorAnalysis).toBe(competitor.getCompetitorAnalysis)
  })
})
