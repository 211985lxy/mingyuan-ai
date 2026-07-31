import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AimAddMenuPanel } from "@/components/aim/aim-add-menu-panel"

const purposeSkills = [
  {
    id: "traffic_funnel",
    label: "我要搞流量",
    description: "停留收藏",
    prompt: "p1",
    group: "内容目的",
  },
  {
    id: "lead_acquisition",
    label: "我要获客",
    description: "私信",
    prompt: "p2",
    group: "内容目的",
  },
]

const otherSkill = {
  id: "market_benchmark_search",
  label: "搜对标选题",
  description: "按关键词搜爆款",
  prompt: "p3",
  group: "选题动作",
}

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
  skills: [...purposeSkills, otherSkill],
  skillQuery: "",
  setSkillQuery: vi.fn(),
  filteredSkills: [
    { group: "内容目的", items: purposeSkills },
    { group: "选题动作", items: [otherSkill] },
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
    expect(html).toContain("内容目的")
    expect(html).toContain("创作模式")
    expect(html).toContain("技能")
    // 根层不铺技能/目的大卡片正文
    expect(html).not.toContain("停留收藏")
    expect(html).not.toContain("按关键词搜爆款")
    expect(html).not.toContain("添加附件 / 技能")
  })

  it("hides the skills root row when only content-purpose skills remain", () => {
    const html = renderToStaticMarkup(
      createElement(AimAddMenuPanel, {
        ...baseProps,
        skills: purposeSkills,
        filteredSkills: [{ group: "内容目的", items: purposeSkills }],
      }),
    )

    expect(html).toContain("内容目的")
    expect(html).toContain("我要搞流量 / 我要获客")
    expect(html).not.toContain(">技能<")
    // 宽松兜底：根层不该出现「N 个内置技能」提示
    expect(html).not.toContain("个内置技能")
  })

  it("surfaces matching purpose skills when searching from the root", () => {
    const html = renderToStaticMarkup(
      createElement(AimAddMenuPanel, {
        ...baseProps,
        skillQuery: "流量",
        filteredSkills: [
          {
            group: "内容目的",
            items: [purposeSkills[0]!],
          },
        ],
      }),
    )

    expect(html).toContain("我要搞流量")
    expect(html).toContain("停留收藏")
    expect(html).not.toContain("创作模式")
  })
})
