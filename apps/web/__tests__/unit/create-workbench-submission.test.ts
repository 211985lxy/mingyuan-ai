import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createProductionPlan: vi.fn(),
  createVideoTask: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  createProductionPlan: mocks.createProductionPlan,
  createVideoTask: mocks.createVideoTask,
}));

import { submitCreateWorkbench } from "@/features/create/services/create-workbench-submission";

function submissionInput() {
  return {
    selectedScriptId: "script_1",
    editedScript: "  可发布文案  ",
    selectedPackagingTemplateId: "packaging_1",
    selectedCopyStructureCode: null,
    fallbackTemplateId: "template_1",
    packagingTemplates: [{ id: "packaging_1", shanjianId: "style_1", recommendation: null }],
    materials: [{ role: "product_detail", type: "image", source: "manual_library", assetId: "asset_1", fileUrl: "https://example.com/a.jpg" }],
    backgroundMusic: null,
    saveScript: vi.fn(async () => {}),
  } as Parameters<typeof submitCreateWorkbench>[0];
}

describe("submitCreateWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProductionPlan.mockResolvedValue({ id: "plan_1" });
    mocks.createVideoTask.mockResolvedValue({ id: "task_1", status: "pending" });
  });

  it("saves the script before creating the production plan and task", async () => {
    const input = submissionInput();
    const result = await submitCreateWorkbench(input);

    expect(input.saveScript).toHaveBeenCalledOnce();
    expect(mocks.createProductionPlan).toHaveBeenCalledWith(expect.objectContaining({
      scriptId: "script_1",
      packagingTemplateId: "packaging_1",
      styleId: "style_1",
      materials: input.materials,
      videoType: "broadcast_mixcut",
    }));
    expect(mocks.createVideoTask).toHaveBeenCalledWith({
      type: "broadcast_mixcut",
      scriptId: "script_1",
      scriptContent: "可发布文案",
      productionPlanId: "plan_1",
      styleId: "style_1",
    });
    expect(result).toEqual({ id: "task_1", status: "pending" });
  });

  it("blocks submission when the packaging template has no style id", async () => {
    const input = submissionInput();
    input.packagingTemplates[0].shanjianId = null;

    await expect(submitCreateWorkbench(input)).rejects.toThrow("当前视频没有可用的包装 styleId");
    expect(input.saveScript).not.toHaveBeenCalled();
    expect(mocks.createProductionPlan).not.toHaveBeenCalled();
  });
});
