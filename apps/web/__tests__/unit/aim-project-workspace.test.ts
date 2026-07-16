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

  it("falls back when a draft contains a stale project", () => {
    expect(selectAuthorizedProjectId("deleted-project", projects)).toBe("project-1")
    expect(selectAuthorizedProjectId("deleted-project", [])).toBe("")
  })
})
