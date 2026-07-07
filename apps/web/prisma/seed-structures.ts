import type { PrismaClient } from "../src/generated/prisma/client"

export const VIDEO_STRUCTURES = [
  {
    name: "contrast-hook",
    displayName: "反差钩子法",
    subtitle: "先打断认知",
    description: "先给观众一个和常识相反的句子或画面，再快速完成解释和转化。",
    useCase: "适合观点挑战、快速破题、强转化开场",
    blueprint: {
      openingPattern: "contrast_hook",
      narrativeBeats: ["hook", "contrast", "reframe", "action"],
      evidenceSlots: 2,
      ctaSlot: "action",
      durationRange: { min: 20, max: 45 },
      pace: "fast",
      evidenceDensity: "medium",
      ctaStyle: "direct",
      packagingIntent: {
        subtitleStyle: "highlight",
        visualPriority: "balanced",
        preferredTemplateCapabilities: ["subtitle", "heavy_subtitle", "strong_title"],
        recommendedMaterialRoles: ["product_detail", "process"],
        bgmGuidance: "偏节奏推动，开场要有瞬时抓力",
        defaultPackRules: {
          headerSwitch: true,
          subtitleSwitch: true,
          keywordSwitch: true,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "preciseMatch",
          materialComposition: "random",
        },
      },
    },
    sortOrder: 1,
  },
  {
    name: "suspense-reveal",
    displayName: "悬念递延法",
    subtitle: "先给结果后解释",
    description: "先抛结果或疑问，把答案延后几个节拍揭开，提升完播和后段留存。",
    useCase: "适合讲结果、讲原因、讲揭晓过程",
    blueprint: {
      openingPattern: "suspense_open",
      narrativeBeats: ["result", "question", "build", "reveal", "cta"],
      evidenceSlots: 2,
      ctaSlot: "follow",
      durationRange: { min: 25, max: 55 },
      pace: "medium",
      evidenceDensity: "medium",
      ctaStyle: "soft",
      packagingIntent: {
        subtitleStyle: "chapter",
        visualPriority: "balanced",
        preferredTemplateCapabilities: ["subtitle", "strong_title"],
        recommendedMaterialRoles: ["process", "store_environment"],
        bgmGuidance: "轻 suspense 或逐步抬升，不要压过口播",
        defaultPackRules: {
          headerSwitch: true,
          subtitleSwitch: true,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "fuzzyMatch",
          materialComposition: "order",
        },
      },
    },
    sortOrder: 2,
  },
  {
    name: "three-beat-ramp",
    displayName: "三拍递进法",
    subtitle: "三段推进",
    description: "把关键信息拆成三个连续节拍，每一拍都比上一拍更有价值。",
    useCase: "适合条理表达、信息整理、三点式输出",
    blueprint: {
      openingPattern: "three_point_open",
      narrativeBeats: ["point_1", "point_2", "point_3", "cta"],
      evidenceSlots: 3,
      ctaSlot: "action",
      durationRange: { min: 30, max: 60 },
      pace: "medium",
      evidenceDensity: "high",
      ctaStyle: "direct",
      packagingIntent: {
        subtitleStyle: "chapter",
        visualPriority: "balanced",
        preferredTemplateCapabilities: ["subtitle", "strong_title", "evidence_insert"],
        recommendedMaterialRoles: ["product_detail", "process", "store_environment"],
        bgmGuidance: "稳定推进型，重在节奏连续",
        defaultPackRules: {
          headerSwitch: true,
          subtitleSwitch: true,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "preciseMatch",
          materialComposition: "order",
        },
      },
    },
    sortOrder: 3,
  },
  {
    name: "proof-first",
    displayName: "现场证明法",
    subtitle: "先看事实",
    description: "先给观众看过程、细节或结果，让证据先于解释出现，提升可信度。",
    useCase: "适合过程证明、细节展示、增强信任感",
    blueprint: {
      openingPattern: "proof_first",
      narrativeBeats: ["proof", "detail", "explanation", "result", "cta"],
      evidenceSlots: 3,
      ctaSlot: "trust",
      durationRange: { min: 25, max: 60 },
      pace: "medium",
      evidenceDensity: "high",
      ctaStyle: "soft",
      packagingIntent: {
        subtitleStyle: "standard",
        visualPriority: "visual_first",
        preferredTemplateCapabilities: ["evidence_insert", "visual_first", "pip"],
        recommendedMaterialRoles: ["process", "product_detail", "store_environment"],
        bgmGuidance: "轻节奏，不要抢过程本身的说服力",
        defaultPackRules: {
          headerSwitch: false,
          subtitleSwitch: true,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "preciseMatch",
          materialComposition: "order",
        },
      },
    },
    sortOrder: 4,
  },
  {
    name: "pain-resonance",
    displayName: "痛点共振法",
    subtitle: "先说不舒服",
    description: "先准确说出观众熟悉的困境和感受，再带他理解问题并走向缓解。",
    useCase: "适合建立信任、降低防备、情绪接住观众",
    blueprint: {
      openingPattern: "pain_resonance",
      narrativeBeats: ["pain", "friction", "truth", "relief", "cta"],
      evidenceSlots: 1,
      ctaSlot: "trust",
      durationRange: { min: 30, max: 65 },
      pace: "slow",
      evidenceDensity: "low",
      ctaStyle: "soft",
      packagingIntent: {
        subtitleStyle: "standard",
        visualPriority: "talking_head",
        preferredTemplateCapabilities: ["identity_card", "subtitle"],
        recommendedMaterialRoles: ["store_environment"],
        bgmGuidance: "偏情绪共鸣，避免过躁",
        defaultPackRules: {
          headerSwitch: false,
          subtitleSwitch: true,
          keywordSwitch: false,
          materialSwitch: false,
        },
        defaultProcessRules: {
          materialComposition: "order",
        },
      },
    },
    sortOrder: 5,
  },
  {
    name: "pov-walkthrough",
    displayName: "POV 带入法",
    subtitle: "跟着我看",
    description: "让观众不是听你解释，而是像跟着你一起经历和观察一个过程。",
    useCase: "适合过程理解、代入体验、跟拍式表达",
    blueprint: {
      openingPattern: "pov_entry",
      narrativeBeats: ["entry", "observe", "notice", "result", "cta"],
      evidenceSlots: 2,
      ctaSlot: "follow",
      durationRange: { min: 20, max: 50 },
      pace: "medium",
      evidenceDensity: "medium",
      ctaStyle: "soft",
      packagingIntent: {
        subtitleStyle: "minimal",
        visualPriority: "visual_first",
        preferredTemplateCapabilities: ["visual_first", "pip", "evidence_insert"],
        recommendedMaterialRoles: ["process", "store_environment"],
        bgmGuidance: "偏轻氛围或轻节奏，让代入感先成立",
        defaultPackRules: {
          headerSwitch: false,
          subtitleSwitch: false,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "fuzzyMatch",
          materialComposition: "order",
        },
      },
    },
    sortOrder: 6,
  },
  {
    name: "objection-dialogue",
    displayName: "对话碰撞法",
    subtitle: "先替用户发问",
    description: "先把观众心里的质疑说出来，再用回应和反回应完成说服。",
    useCase: "适合处理疑虑、异议拆解、双立场表达",
    blueprint: {
      openingPattern: "objection_open",
      narrativeBeats: ["objection", "response", "deeper_objection", "resolution", "cta"],
      evidenceSlots: 2,
      ctaSlot: "consult",
      durationRange: { min: 25, max: 55 },
      pace: "medium",
      evidenceDensity: "medium",
      ctaStyle: "direct",
      packagingIntent: {
        subtitleStyle: "chapter",
        visualPriority: "talking_head",
        preferredTemplateCapabilities: ["subtitle", "identity_card", "strong_title"],
        recommendedMaterialRoles: ["product_detail", "process"],
        bgmGuidance: "轻推节奏即可，重点是对话碰撞感",
        defaultPackRules: {
          headerSwitch: true,
          subtitleSwitch: true,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "fuzzyMatch",
          materialComposition: "order",
        },
      },
    },
    sortOrder: 7,
  },
  {
    name: "before-after-contrast",
    displayName: "对比翻转法",
    subtitle: "一眼看差别",
    description: "把旧状态和新状态、错误方法和正确方法并列，让变化本身成为说服。",
    useCase: "适合展示变化、对比感、前后差异",
    blueprint: {
      openingPattern: "before_after_open",
      narrativeBeats: ["before", "problem", "after", "difference", "cta"],
      evidenceSlots: 3,
      ctaSlot: "action",
      durationRange: { min: 20, max: 50 },
      pace: "fast",
      evidenceDensity: "high",
      ctaStyle: "hard",
      packagingIntent: {
        subtitleStyle: "highlight",
        visualPriority: "balanced",
        preferredTemplateCapabilities: ["evidence_insert", "subtitle", "strong_title"],
        recommendedMaterialRoles: ["product_detail", "process", "before_after"],
        bgmGuidance: "变化感要明显，适合更有切换感的节奏",
        defaultPackRules: {
          headerSwitch: true,
          subtitleSwitch: true,
          keywordSwitch: true,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialMatchWay: "preciseMatch",
          materialComposition: "random",
        },
      },
    },
    sortOrder: 8,
  },
  {
    name: "loopback-close",
    displayName: "回环重播法",
    subtitle: "首尾闭环",
    description: "让结尾重新扣回开头，形成语义或视觉闭环，增强重复观看。",
    useCase: "适合记忆点表达、重播感、完成度强化",
    blueprint: {
      openingPattern: "loop_open",
      narrativeBeats: ["hook", "build", "payoff", "loopback", "cta"],
      evidenceSlots: 1,
      ctaSlot: "follow",
      durationRange: { min: 15, max: 35 },
      pace: "medium",
      evidenceDensity: "low",
      ctaStyle: "soft",
      packagingIntent: {
        subtitleStyle: "minimal",
        visualPriority: "visual_first",
        preferredTemplateCapabilities: ["visual_first", "subtitle"],
        recommendedMaterialRoles: ["process"],
        bgmGuidance: "适合有循环感或轻卡点的音乐",
        defaultPackRules: {
          headerSwitch: false,
          subtitleSwitch: false,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialComposition: "order",
        },
      },
    },
    sortOrder: 9,
  },
  {
    name: "visual-gimmick",
    displayName: "视觉机关法",
    subtitle: "让画面先说话",
    description: "让视觉变化本身成为主内容，用物体变化、空间错位或卡点替换制造记忆点。",
    useCase: "适合视觉惊喜、品牌记忆、轻叙事表达",
    blueprint: {
      openingPattern: "visual_gimmick",
      narrativeBeats: ["visual_hook", "twist", "reveal", "cta"],
      evidenceSlots: 1,
      ctaSlot: "action",
      durationRange: { min: 10, max: 30 },
      pace: "fast",
      evidenceDensity: "low",
      ctaStyle: "direct",
      packagingIntent: {
        subtitleStyle: "minimal",
        visualPriority: "visual_first",
        preferredTemplateCapabilities: ["visual_first", "pip"],
        recommendedMaterialRoles: ["product_detail", "process"],
        bgmGuidance: "适合卡点或强节奏型音乐",
        defaultPackRules: {
          headerSwitch: false,
          subtitleSwitch: false,
          keywordSwitch: false,
          materialSwitch: true,
        },
        defaultProcessRules: {
          materialComposition: "random",
        },
      },
    },
    sortOrder: 10,
  },
] as const

export const CANONICAL_STRUCTURE_NAMES = VIDEO_STRUCTURES.map((structure) => structure.name)

export async function syncCanonicalVideoStructures(
  prisma: PrismaClient,
  options: { archiveLegacy?: boolean } = {},
) {
  for (const structure of VIDEO_STRUCTURES) {
    await prisma.videoStructure.upsert({
      where: { name: structure.name },
      update: {
        displayName: structure.displayName,
        subtitle: structure.subtitle,
        description: structure.description,
        useCase: structure.useCase,
        blueprint: structure.blueprint,
        sortOrder: structure.sortOrder,
        status: "published",
      },
      create: {
        name: structure.name,
        displayName: structure.displayName,
        subtitle: structure.subtitle,
        description: structure.description,
        useCase: structure.useCase,
        blueprint: structure.blueprint,
        sortOrder: structure.sortOrder,
        status: "published",
      },
    })
  }

  let archivedCount = 0
  if (options.archiveLegacy) {
    const archived = await prisma.videoStructure.updateMany({
      where: {
        name: { notIn: CANONICAL_STRUCTURE_NAMES },
        status: { in: ["published", "draft"] },
      },
      data: {
        status: "archived",
      },
    })
    archivedCount = archived.count
  }

  return {
    upserted: VIDEO_STRUCTURES.length,
    archived: archivedCount,
  }
}

export async function seedStructures(prisma: PrismaClient) {
  const result = await syncCanonicalVideoStructures(prisma, { archiveLegacy: true })
  console.log(
    `✓ Upserted ${result.upserted} video structures${result.archived > 0 ? `, archived ${result.archived} legacy structures` : ""}`,
  )
}
