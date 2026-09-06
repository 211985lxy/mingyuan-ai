import { describe, expect, it } from "vitest"

import { describeProjectAccessGate, selectAuthorizedProjectId } from "@/hooks/use-aim-project-workspace"
import type { ClientProject } from "@/lib/api/client"
import type { AccountProjectContextResponse } from "@/lib/api/projects"

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

  it("does not choose among multiple projects when no binding is provided", () => {
    expect(selectAuthorizedProjectId("", projects)).toBe("")
  })

  it("accepts the sole project returned for a bound account", () => {
    expect(selectAuthorizedProjectId("", [projects[0]])).toBe("project-1")
  })

  // Task 8: 账号绑定规范下服务端只返回一个绑定项目。URL / 历史里的陈旧
  // projectId 必须被忽略，并替换为服务端返回的绑定项目。
  it("replaces a stale URL projectId with the single bound project returned by the server", () => {
    expect(
      selectAuthorizedProjectId("stale-project", [{ id: "bound-project" }] as ClientProject[]),
    ).toBe("bound-project")
  })

  it("keeps the stale URL projectId out of the post-refresh workflow-history request", () => {
    const bound = [{ id: "bound-project" }] as ClientProject[]
    // refreshProjectWorkflow 只按规范后的 selectedProjectId 请求 listAimHistory，
    // 因此刷新后历史列表只携带绑定项目、绝不携带陈旧 URL 值。
    const requestedAfterRefresh = selectAuthorizedProjectId("stale-project", bound)
    expect(requestedAfterRefresh).toBe("bound-project")
    expect(requestedAfterRefresh).not.toBe("stale-project")
  })

  it("resolves the bound scope identically for quick and full workspaces", () => {
    const bound = [{ id: "bound-project" }] as ClientProject[]
    expect(selectAuthorizedProjectId("stale-project", bound)).toBe("bound-project")
    expect(selectAuthorizedProjectId("", bound)).toBe("bound-project")
  })
})

describe("describeProjectAccessGate", () => {
  const boundContext: AccountProjectContextResponse = {
    status: "bound",
    project: { id: "project-1", name: "项目一" } as ClientProject,
  }

  it("lets a bound workspace continue to the project list", () => {
    const gate = describeProjectAccessGate(boundContext)
    expect(gate.blocked).toBe(false)
    expect(gate.accessError).toBeNull()
  })

  it("blocks setup_required accounts with the project-setup notice", () => {
    const gate = describeProjectAccessGate({ status: "setup_required" })
    expect(gate.blocked).toBe(true)
    expect(gate.accessError).toBe("当前账号尚未绑定 IP 项目，请先完成项目设置。")
  })

  it("blocks admin_review_required accounts with the admin-review notice", () => {
    const gate = describeProjectAccessGate({ status: "admin_review_required", projectCount: 2 })
    expect(gate.blocked).toBe(true)
    expect(gate.accessError).toContain("2 个待绑定项目")
    expect(gate.accessError).toContain("请联系管理员处理")
  })

  it("surfaces the 4th inactive-recovery status as a clear non-bound state pointing at admin recovery", () => {
    const gate = describeProjectAccessGate({ status: "inactive_project_recovery_required", projectCount: 1 })
    expect(gate.blocked).toBe(true)
    expect(gate.accessError).toContain("1 个停用项目待恢复")
    expect(gate.accessError).toContain("请联系管理员恢复")
    expect(gate.accessError).not.toContain("已绑定")
  })
})
