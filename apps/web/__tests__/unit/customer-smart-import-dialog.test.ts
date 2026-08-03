import { createElement, createRef } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { CustomerSmartImportUploadStep } from "@/features/knowledge/components/customer-smart-import-upload-step"

describe("CustomerSmartImportUploadStep", () => {
  it("renders drag-drop upload copy and project name", () => {
    const html = renderToStaticMarkup(
      createElement(CustomerSmartImportUploadStep, {
        projectId: "project-1",
        projectOptions: [
          {
            id: "project-1",
            name: "测试 IP",
            companyName: null,
            industry: null,
            targetCustomer: null,
            offer: null,
            deliveryGoal: null,
            status: "active",
            notes: null,
            createdAt: "2026-07-17T00:00:00.000Z",
            updatedAt: "2026-07-17T00:00:00.000Z",
          },
        ],
        files: [],
        dragOver: false,
        fileInputRef: createRef<HTMLInputElement>(),
        onProjectChange: vi.fn(),
        onAddFiles: vi.fn(),
        onRemoveFile: vi.fn(),
        onDragOverChange: vi.fn(),
        onAnalyze: vi.fn(),
        onCancel: vi.fn(),
      }),
    )

    expect(html).toContain("把文件拖到这里，或点击选择")
    expect(html).toContain("开始清洗")
    expect(html).toContain("归属全案")
  })
})
