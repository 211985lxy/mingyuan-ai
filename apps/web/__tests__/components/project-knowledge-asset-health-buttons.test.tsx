import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"

import { ProjectKnowledgeAssetHealth } from "@/components/projects/project-knowledge-asset-health"
import { computeKnowledgeAssetHealth } from "@/lib/knowledge-asset-health"
import { createKnowledge, fetchKnowledgeAssetHealth } from "@/lib/api/knowledge"

vi.mock("@/lib/api/knowledge", () => ({
  createKnowledge: vi.fn(),
  fetchKnowledgeAssetHealth: vi.fn(),
}))

describe("ProjectKnowledgeAssetHealth buttons", () => {
  it("opens every missing asset box, closes safely, validates and saves one supplement", async () => {
    const user = userEvent.setup()
    const health = computeKnowledgeAssetHealth([])
    vi.mocked(fetchKnowledgeAssetHealth).mockResolvedValue({
      health,
      scannedCount: 0,
      truncated: false,
    })
    vi.mocked(createKnowledge).mockResolvedValue({
      id: "kb-created",
      userId: "user-1",
      projectId: "project-1",
      category: "positioning_material",
      title: "领秀定位",
      content: "服务需要稳定内容获客的企业负责人。",
      tags: [],
      sourceType: "manual",
      sortOrder: 0,
      status: "active",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    })
    const onSaved = vi.fn()
    render(
      <ProjectKnowledgeAssetHealth
        projectId="project-1"
        variant="chips"
        onSaved={onSaved}
      />,
    )

    const missingButtons = await screen.findAllByRole("button", { name: /待补充/ })
    expect(missingButtons).toHaveLength(5)
    for (const button of missingButtons) {
      await user.click(button)
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      await user.click(screen.getByRole("button", { name: "Close" }))
    }

    await user.click(screen.getAllByRole("button", { name: /待补充/ })[0])
    expect(screen.getByRole("heading", { name: "补录IP资产" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "拖文件入库" })).toBeInTheDocument()
    expect(screen.queryByText(/表达风格/)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "写入知识库" }))
    expect(toast.error).toHaveBeenCalledWith("请填写标题和内容")
    expect(createKnowledge).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText("标题"), "领秀定位")
    await user.type(screen.getByLabelText("内容"), "服务需要稳定内容获客的企业负责人。")
    await user.click(screen.getByRole("button", { name: "写入知识库" }))

    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1))
    expect(createKnowledge).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      category: "positioning_material",
      title: "领秀定位",
    }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
