import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(process.cwd(), "src")

describe("customer knowledge workspace wiring", () => {
  it("exposes 我的知识库 in the customer sidebar", () => {
    const source = readFileSync(join(ROOT, "components/layout/app-sidebar.tsx"), "utf8")
    expect(source).toContain('title: "我的知识库"')
    expect(source).toContain('href: "/knowledge"')
    expect(source).not.toContain("/admin/knowledge")
    expect(source).not.toContain("/meeting-minutes")
    expect(source).not.toContain('title: "会议纪要"')
  })

  it("keeps meeting-minutes route as a knowledge redirect", () => {
    const page = readFileSync(join(ROOT, "app/(dashboard)/meeting-minutes/page.tsx"), "utf8")
    expect(page).toContain('redirect("/knowledge?intent=meeting")')
    expect(page).not.toContain("MeetingMinutesWorkspace")
  })

  it("wires meeting transcription into the knowledge workspace", () => {
    const workspace = readFileSync(
      join(ROOT, "features/knowledge/components/customer-knowledge-workspace.tsx"),
      "utf8",
    )
    expect(workspace).toContain("会议转写")
    expect(workspace).toContain('intent") !== "meeting"')
    expect(workspace).toContain("MeetingMinutesImportDialog")
  })

  it("adds an account shortcut into /knowledge", () => {
    const source = readFileSync(join(ROOT, "app/(dashboard)/account/page.tsx"), "utf8")
    expect(source).toContain("我的知识库")
    expect(source).toContain('router.push("/knowledge")')
    expect(source).not.toContain("/admin/knowledge")
  })

  it("keeps the customer workspace on customer knowledge APIs only", () => {
    const page = readFileSync(join(ROOT, "app/(dashboard)/knowledge/page.tsx"), "utf8")
    const workspace = readFileSync(
      join(ROOT, "features/knowledge/components/customer-knowledge-workspace.tsx"),
      "utf8",
    )
    const dialog = readFileSync(
      join(ROOT, "features/knowledge/components/customer-knowledge-entry-dialog.tsx"),
      "utf8",
    )
    const dataHook = readFileSync(
      join(ROOT, "features/knowledge/hooks/use-customer-knowledge-data.ts"),
      "utf8",
    )
    const mutationHelpers = readFileSync(
      join(ROOT, "features/knowledge/hooks/customer-knowledge-mutation-helpers.ts"),
      "utf8",
    )
    const combined = `${page}\n${workspace}\n${dialog}\n${dataHook}\n${mutationHelpers}`
    expect(combined).toContain("listKnowledge")
    expect(combined).toContain("createKnowledge")
    expect(combined).toContain("updateKnowledge")
    expect(combined).toContain("archiveKnowledge")
    expect(combined).not.toContain("/api/admin/")
    expect(combined).not.toContain("useAdminKnowledge")
    expect(combined).not.toContain("admin-knowledge-shared")
  })
})
