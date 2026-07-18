import { describe, expect, it } from "vitest"

import { selectAuthorizedProjectId } from "@/hooks/use-aim-project-workspace"
import type { ClientProject } from "@/lib/api/client"

const projects = [
  { id: "project-1", name: "项目一" },
  { id: "project-2", name: "项目二" },
] as ClientProject[]

describe("selectAuthorizedProjectId", () => {
  it("keeps a project that still belongs to the current user", () => {
    expect(selectAuthorizedProjectId("project-2", projects)).toBe("project-2")
  })

  it("does not silently switch when a requested project is stale", () => {
    expect(selectAuthorizedProjectId("deleted-project", projects)).toBe("")
    expect(selectAuthorizedProjectId("deleted-project", [])).toBe("")
  })

  it("selects the first project only when no project was requested", () => {
    expect(selectAuthorizedProjectId("", projects)).toBe("project-1")
  })
})
