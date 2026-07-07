import { describe, expect, it } from "vitest"

import {
  buildStructurePackagingIntent,
  inferPackagingTemplateCapabilities,
  mergeJsonRecords,
  recommendPackagingTemplate,
} from "@/lib/video-template-config"
import type { ShanjianTemplateDetail } from "@/types/shanjian"

describe("video-template-config", () => {
  it("infers packaging capabilities from template layer detail", () => {
    const detail: ShanjianTemplateDetail = {
      id: "tmpl-1",
      name: "带标题字幕身份栏",
      coverUrl: "https://example.com/cover.jpg",
      demoUrl: "https://example.com/demo.mp4",
      scene: "virtualman",
      videoStructInfo: {
        editInfo: {
          canvas: { width: 1080, height: 1920 },
          headerLayer: {
            width: 960,
            height: 120,
            transform: {
              anchor: [0, 0, 0],
              scalar: [1, 1, 1],
              position: [0, 0, 0],
            },
          },
          subtitleLayer: {
            width: 960,
            height: 180,
            transform: {
              anchor: [0, 0, 0],
              scalar: [1, 1, 1],
              position: [0, 0, 0],
            },
          },
          ipLayer: {
            width: 400,
            height: 120,
            transform: {
              anchor: [0, 0, 0],
              scalar: [1, 1, 1],
              position: [0, 0, 0],
            },
          },
        },
      },
    }

    expect(inferPackagingTemplateCapabilities(detail)).toEqual([
      "strong_title",
      "subtitle",
      "heavy_subtitle",
      "identity_card",
    ])
  })

  it("deep merges template defaults with explicit overrides", () => {
    expect(
      mergeJsonRecords(
        {
          subtitleSwitch: true,
          backgroundMusic: {
            audioSwitch: true,
            volume: 30,
          },
        },
        {
          backgroundMusic: {
            volume: 80,
          },
        },
      ),
    ).toEqual({
      subtitleSwitch: true,
      backgroundMusic: {
        audioSwitch: true,
        volume: 80,
      },
    })
  })

  it("derives fallback packaging intent from structure pacing and evidence density", () => {
    expect(
      buildStructurePackagingIntent({
        openingPattern: "contrast_hook",
        narrativeBeats: ["hook", "proof", "cta"],
        evidenceSlots: 2,
        ctaSlot: "action",
        durationRange: { min: 20, max: 45 },
        pace: "fast",
        evidenceDensity: "high",
      }),
    ).toMatchObject({
      subtitleStyle: "highlight",
      visualPriority: "balanced",
      preferredTemplateCapabilities: expect.arrayContaining([
        "subtitle",
        "heavy_subtitle",
        "evidence_insert",
      ]),
      recommendedMaterialRoles: ["product_detail", "store_environment", "process"],
    })
  })

  it("scores a structure/template pair and returns recommendation presets", () => {
    const recommendation = recommendPackagingTemplate({
      template: {
        id: "tmpl-recommended",
        name: "强字幕证据模板",
        capabilities: ["subtitle", "heavy_subtitle", "evidence_insert"],
      },
      structureBlueprint: {
        openingPattern: "proof_first",
        narrativeBeats: ["proof", "detail", "cta"],
        evidenceSlots: 3,
        ctaSlot: "action",
        durationRange: { min: 25, max: 60 },
        pace: "medium",
        evidenceDensity: "high",
        packagingIntent: {
          subtitleStyle: "highlight",
          visualPriority: "balanced",
          preferredTemplateCapabilities: ["subtitle", "heavy_subtitle", "evidence_insert"],
          requiredTemplateCapabilities: [],
          recommendedMaterialRoles: ["product_detail", "process"],
          bgmGuidance: "保持推进感",
          defaultPackRules: {
            subtitleSwitch: true,
            keywordSwitch: true,
            materialSwitch: true,
          },
          defaultProcessRules: {
            materialMatchWay: "preciseMatch",
          },
        },
      },
      scriptContent: "这是一段偏长的脚本内容，用来验证字幕承载和证据插入能力是否被正确识别。".repeat(8),
    })

    expect(recommendation.tier).toBe("recommended")
    expect(recommendation.score).toBeGreaterThanOrEqual(78)
    expect(recommendation.reasons.length).toBeGreaterThan(0)
    expect(recommendation.presetPackRules).toMatchObject({
      subtitleSwitch: true,
      keywordSwitch: true,
      materialSwitch: true,
    })
    expect(recommendation.presetProcessRules).toMatchObject({
      materialMatchWay: "preciseMatch",
    })
  })

  it("blocks templates only when a required capability is missing", () => {
    const recommendation = recommendPackagingTemplate({
      template: {
        id: "tmpl-blocked",
        name: "纯人口播模板",
        capabilities: ["identity_card"],
      },
      structureBlueprint: {
        openingPattern: "proof_first",
        narrativeBeats: ["proof", "detail", "cta"],
        evidenceSlots: 3,
        ctaSlot: "action",
        durationRange: { min: 25, max: 60 },
        packagingIntent: {
          subtitleStyle: "standard",
          visualPriority: "balanced",
          preferredTemplateCapabilities: ["subtitle"],
          requiredTemplateCapabilities: ["evidence_insert"],
          recommendedMaterialRoles: ["process"],
          bgmGuidance: "保持中性",
        },
      },
    })

    expect(recommendation.tier).toBe("blocked")
    expect(recommendation.blockingReasons).toEqual(["缺少 证据插入"])
  })
})
