import { describe, expect, it } from "vitest"

import {
  normalizeBindingName,
  chooseUniqueBindingCandidate,
} from "@/lib/account-project-binding-backfill"

describe("account project binding backfill", () => {
  it("normalizes names without collapsing meaningful Chinese characters", () => {
    expect(normalizeBindingName("  AI商业顾问（明远） ")).toBe("ai商业顾问明远")
  })

  it("chooses a project only when exactly one project matches account names", () => {
    const project = { id: "project-ai", name: "AI商业顾问", companyName: "明远" }
    expect(chooseUniqueBindingCandidate({
      userName: "AI商业顾问",
      profileNames: ["明远"],
      projects: [project],
    })).toEqual(project)
  })

  it("leaves ambiguous and unmatched accounts for admin review", () => {
    const projects = [
      { id: "project-1", name: "同名项目", companyName: null },
      { id: "project-2", name: "同名项目", companyName: null },
    ]
    expect(chooseUniqueBindingCandidate({
      userName: "同名项目",
      profileNames: [],
      projects,
    })).toBeNull()
    expect(chooseUniqueBindingCandidate({
      userName: "没有匹配",
      profileNames: [],
      projects: [projects[0]],
    })).toBeNull()
  })
})
