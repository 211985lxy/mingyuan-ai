import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AimAddMenuPanel } from "@/components/aim/aim-add-menu-panel"

const baseProps = {
  busy: false,
  isPlanMode: false,
  canUsePlanMode: true,
  composerMode: "direct" as const,
  onComposerModeChange: vi.fn(),
  showPlanModeControl: true,
  onAddImages: true,
  showContentModeControl: true,
  contentMode: undefined,
  contentModeLabel: "自动",
  contentModeExpanded: false,
  setContentModeExpanded: vi.fn(),
  contentModeOptions: [
    { id: undefined, label: "自动", hint: "按任务判断" },
    { id: "short_video" as const, label: "短视频", hint: "口播" },
  ],
  onContentModeChange: vi.fn(),
  showSkills: true,
  skills: [
    { id: "traffic_funnel", label: "流量漏斗", description: "停留收藏", prompt: "p1" },
    { id: "lead_acquisition", label: "线索获客", description: "私信", prompt: "p2" },
  ],
  skillQuery: "",
  setSkillQuery: vi.fn(),
  filteredSkills: [
    {
      group: "",
      items: [
        { id: "traffic_funnel", label: "流量漏斗", description: "停留收藏", prompt: "p1" },
        { id: "lead_acquisition", label: "线索获客", description: "私信", prompt: "p2" },
      ],
    },
  ],
  onUseSkill: vi.fn(),
  close: vi.fn(),
  fileInputRef: { current: null },
}

describe("AimAddMenuPanel", () => {
  it("renders Cursor-style searchable list rows on the root view", () => {
    const html = renderToStaticMarkup(createElement(AimAddMenuPanel, baseProps))

    expect(html).toContain("添加图片、模式、技能")
    expect(html).toContain("计划模式")
    expect(html).toContain("图片")
    expect(html).toContain("创作模式")
    expect(html).toContain("技能")
    // 根层不铺技能大卡片正文
    expect(html).not.toContain("停留收藏")
    expect(html).not.toContain("添加附件 / 技能")
  })

  it("surfaces matching skills when searching from the root", () => {
    const html = renderToStaticMarkup(
      createElement(AimAddMenuPanel, {
        ...baseProps,
        skillQuery: "流量",
        filteredSkills: [
          {
            group: "",
            items: [
              {
                id: "traffic_funnel",
                label: "流量漏斗",
                description: "停留收藏",
                prompt: "p1",
              },
            ],
          },
        ],
      }),
    )

    expect(html).toContain("流量漏斗")
    expect(html).toContain("停留收藏")
    expect(html).not.toContain("创作模式")
  })
})
