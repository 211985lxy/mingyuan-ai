import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CustomerKnowledgeWorkspace } from "@/features/knowledge/components/customer-knowledge-workspace"
import { CustomerKnowledgeEntryCard } from "@/features/knowledge/components/customer-knowledge-entry-card"
import { CustomerKnowledgeEntryDialog } from "@/features/knowledge/components/customer-knowledge-entry-dialog"
import { ExternalAiMemoryImportFields } from "@/features/knowledge/components/external-ai-memory-import-fields"
import {
  CATEGORY_LABELS,
  KNOWLEDGE_CATEGORIES,
} from "@/lib/knowledge-categories"
import type { KnowledgeEntry } from "@/lib/api/client"

const workspaceState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/features/knowledge/hooks/use-customer-knowledge-workspace", () => ({
  useCustomerKnowledgeWorkspace: () => workspaceState.current,
}))

vi.mock("@/components/projects/project-knowledge-asset-health", () => ({
  ProjectKnowledgeAssetHealth: ({ openGapRequest }: { openGapRequest: number }) => (
    <div data-testid="asset-health" data-open-gap-request={openGapRequest} />
  ),
}))

vi.mock("@/features/knowledge/components/external-ai-memory-import-dialog", () => ({
  ExternalAiMemoryImportDialog: () => null,
}))

const entry: KnowledgeEntry = {
  id: "kb-1",
  userId: "user-1",
  projectId: "project-1",
  category: "boss_experience",
  title: "客户真正关心交付周期",
  content: "客户通常先问多久能见到第一版结果。",
  tags: ["演示"],
  sourceType: "manual",
  sortOrder: 0,
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    entries: [entry],
    visibleEntries: [entry],
    projects: [],
    projectNameById: new Map([["project-1", "领秀演示项目"]]),
    defaultAccountId: "project-1",
    ensuringAccount: false,
    ensureAccount: vi.fn().mockResolvedValue({ id: "project-1" }),
    loading: false,
    loadError: null,
    load: vi.fn().mockResolvedValue(undefined),
    keyword: "",
    setKeyword: vi.fn(),
    projectFilter: "all",
    categoryFilter: "all",
    setCategoryFilter: vi.fn(),
    statusFilter: "active",
    dialogOpen: false,
    setDialogOpen: vi.fn(),
    dialogMode: "create",
    form: {
      title: "",
      content: "",
      category: "boss_experience",
      tags: "",
      projectId: "none",
    },
    setForm: vi.fn(),
    saving: false,
    archivingId: null,
    memoryImportOpen: false,
    setMemoryImportOpen: vi.fn(),
    openCreate: vi.fn(),
    openMemoryImport: vi.fn(),
    openEdit: vi.fn(),
    handleSave: vi.fn(),
    handleArchive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe("customer knowledge workspace buttons", () => {
  beforeEach(() => {
    workspaceState.current = createWorkspace()
  })

  it("covers category, search, create, memory, account, edit and archive controls", async () => {
    const user = userEvent.setup()
    render(<CustomerKnowledgeWorkspace />)
    const ws = workspaceState.current as ReturnType<typeof createWorkspace>

    await user.click(screen.getByRole("button", { name: "全部资料 1" }))
    await user.click(screen.getByRole("button", { name: "全部 1" }))
    for (const category of KNOWLEDGE_CATEGORIES) {
      const label = CATEGORY_LABELS[category] ?? category
      const buttons = screen.getAllByRole("button", { name: label })
      expect(buttons.length).toBeGreaterThanOrEqual(1)
      for (const button of buttons) await user.click(button)
    }

    await user.type(screen.getByPlaceholderText("搜索标题、内容或标签"), "交付")
    await user.click(screen.getByRole("button", { name: "手动一条" }))
    await user.click(screen.getByRole("button", { name: "粘贴记忆" }))
    await user.click(screen.getByRole("button", { name: "塞一条经验进去" }))
    await user.click(screen.getByRole("button", { name: `编辑知识：${entry.title}` }))
    await user.click(screen.getByRole("button", { name: `归档知识：${entry.title}` }))

    expect(ws.setCategoryFilter).toHaveBeenCalledWith("all")
    for (const category of KNOWLEDGE_CATEGORIES) {
      expect(ws.setCategoryFilter).toHaveBeenCalledWith(category)
    }
    expect(ws.setKeyword).toHaveBeenCalled()
    expect(ws.openCreate).toHaveBeenCalledTimes(1)
    expect(ws.openMemoryImport).toHaveBeenCalledTimes(1)
    expect(ws.ensureAccount).toHaveBeenCalledTimes(1)
    expect(ws.openEdit).toHaveBeenCalledWith(entry)
    expect(ws.handleArchive).toHaveBeenCalledWith(entry)
    await waitFor(() => {
      expect(screen.getByTestId("asset-health")).toHaveAttribute("data-open-gap-request", "1")
    })
  })

  it("retries a failed knowledge load", async () => {
    const user = userEvent.setup()
    workspaceState.current = createWorkspace({
      entries: [],
      visibleEntries: [],
      defaultAccountId: null,
      loadError: "知识库读取失败",
    })
    render(<CustomerKnowledgeWorkspace />)

    await user.click(screen.getByRole("button", { name: "重试" }))
    expect((workspaceState.current as ReturnType<typeof createWorkspace>).load).toHaveBeenCalledTimes(1)
  })
})

describe("customer knowledge entry controls", () => {
  it("gives icon buttons stable names and fires edit/archive actions", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onArchive = vi.fn()
    render(
      <CustomerKnowledgeEntryCard
        entry={entry}
        projectName="领秀演示项目"
        archiving={false}
        onEdit={onEdit}
        onArchive={onArchive}
      />,
    )

    await user.click(screen.getByRole("button", { name: `编辑知识：${entry.title}` }))
    await user.click(screen.getByRole("button", { name: `归档知识：${entry.title}` }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  it("wires dialog cancel and save buttons", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSave = vi.fn()
    render(
      <CustomerKnowledgeEntryDialog
        open
        mode="create"
        form={{ title: "", content: "", category: "boss_experience", tags: "", projectId: "none" }}
        projects={[]}
        saving={false}
        onOpenChange={onOpenChange}
        onFormChange={vi.fn()}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("wires external-memory cancel, preview and confirm buttons", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onParse = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ExternalAiMemoryImportFields
        projectId="project-1"
        projects={[]}
        rawText="关于你的记忆\n工作背景\n真实内容"
        parsed={{
          ok: true,
          sourceLabel: "外部 AI",
          summary: "已识别 1 组记忆",
          drafts: [{ sectionKey: "work", title: "工作背景", content: "真实内容" }],
        }}
        saving={false}
        onProjectIdChange={vi.fn()}
        onRawTextChange={vi.fn()}
        onCancel={onCancel}
        onParse={onParse}
        onConfirm={onConfirm}
      />,
    )

    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "解析预览" }))
    await user.click(screen.getByRole("button", { name: "确认入库" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onParse).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
