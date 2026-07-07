import { describe, expect, it } from "vitest"

import { getAimEditorPanelLabels } from "@/lib/aim-editor-labels"

describe("aim editor labels", () => {
  it("keeps copy deliverables labeled as copy when the selected agent is planning", () => {
    const labels = getAimEditorPanelLabels("business_diagnosis", "video_script")

    expect(labels.title).toBe("文案编辑")
    expect(labels.draftTitle).toBe("我的稿子")
    expect(labels.documentType).toBe("copy")
  })

  it("keeps raw planning output labeled as planning", () => {
    const labels = getAimEditorPanelLabels("business_diagnosis", "raw_copy")

    expect(labels.title).toBe("策划案编辑")
    expect(labels.draftTitle).toBe("我的策划案")
  })

  it("labels delivery copywriter output as copy editing", () => {
    const labels = getAimEditorPanelLabels("free_copywriter", "raw_copy")

    expect(labels.title).toBe("文案编辑")
    expect(labels.draftTitle).toBe("我的稿子")
  })
})
