import { describe, expect, it } from "vitest"

import { removeProjectFromAllowedProjects } from "@/features/projects/services/project-lifecycle"

describe("project lifecycle", () => {
  it("removes a deleted project from Agent API scopes", () => {
    expect(removeProjectFromAllowedProjects(["p1", "p2", 3], "p1")).toEqual(["p2"])
  })

  it("treats malformed project scopes as empty", () => {
    expect(removeProjectFromAllowedProjects(null, "p1")).toEqual([])
  })
})
