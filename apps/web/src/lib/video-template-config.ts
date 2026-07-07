import type { ContentTemplate } from "@/generated/prisma/client"
import type { ShanjianTemplateDetail } from "@/types/shanjian"
import type {
  ApiPackagingRecommendationContext,
  ApiPackagingTemplateRecommendation,
  ApiStructurePackagingIntent,
} from "@/types/api"
import type { StructureBlueprint } from "@/lib/script-generator"

type JsonRecord = Record<string, unknown>
type RecommendationTier = ApiPackagingTemplateRecommendation["tier"]

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function cloneRecord(value: JsonRecord | null | undefined): JsonRecord | null {
  if (!value) return null
  return JSON.parse(JSON.stringify(value)) as JsonRecord
}

export function asJsonRecord(value: unknown): JsonRecord | null {
  return isPlainObject(value) ? (value as JsonRecord) : null
}

export function mergeJsonRecords(
  base: JsonRecord | null | undefined,
  override: JsonRecord | null | undefined,
): JsonRecord | null {
  if (!base && !override) return null
  if (!base) return cloneRecord(override)
  if (!override) return cloneRecord(base)

  const merged: JsonRecord = cloneRecord(base) ?? {}
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeJsonRecords(
        merged[key] as JsonRecord,
        value,
      ) as JsonRecord
      continue
    }
    merged[key] = value
  }
  return merged
}

export interface ContentTemplatePlanDefaults {
  styleId: string | null
  videoType: string
  packRules: JsonRecord | null
  processRules: JsonRecord | null
}

const CAPABILITY_ALIASES: Record<string, string> = {
  header: "strong_title",
  subtitle: "subtitle",
  identity_card: "identity_card",
  keyword_highlight: "heavy_subtitle",
}

export const PACKAGING_CAPABILITY_LABELS: Record<string, string> = {
  subtitle: "字幕",
  heavy_subtitle: "强字幕",
  strong_title: "标题栏",
  identity_card: "身份栏",
  evidence_insert: "证据插入",
  pip: "画中画",
  visual_first: "画面主导",
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function uniq(items: string[]): string[] {
  return [...new Set(items)]
}

function normalizeCapability(value: string): string {
  const normalized = value.trim().toLowerCase()
  return CAPABILITY_ALIASES[normalized] ?? normalized
}

export function resolveContentTemplatePlanDefaults(
  template:
    | Pick<
        ContentTemplate,
        "shanjianStyleId" | "videoType" | "packRulesJson" | "processRulesJson"
      >
    | null
    | undefined,
): ContentTemplatePlanDefaults | null {
  if (!template) return null

  return {
    styleId: template.shanjianStyleId ?? null,
    videoType: template.videoType || "virtualman_broadcast",
    packRules: asJsonRecord(template.packRulesJson),
    processRules: asJsonRecord(template.processRulesJson),
  }
}

function hasTemplateLayer(layer: unknown): boolean {
  return isPlainObject(layer) && Object.keys(layer).length > 0
}

export function normalizePackagingTemplateCapabilities(input: {
  capabilities?: unknown
  name?: string | null
  description?: string | null
}): string[] {
  const rawCapabilities = Array.isArray(input.capabilities)
    ? input.capabilities.filter((item): item is string => typeof item === "string")
    : []
  const capabilities = rawCapabilities.map(normalizeCapability)
  const name = `${input.name ?? ""} ${input.description ?? ""}`.toLowerCase()

  if (/标题|title/.test(name)) {
    capabilities.push("strong_title")
  }
  if (/字幕|subtitle|caption/.test(name)) {
    capabilities.push("subtitle", "heavy_subtitle")
  }
  if (/身份|ip|人物卡/.test(name)) {
    capabilities.push("identity_card")
  }
  if (/画中画|pip/.test(name)) {
    capabilities.push("pip")
  }
  if (/素材|证据|插入|mix/.test(name)) {
    capabilities.push("evidence_insert")
  }
  if (/氛围|画面|cinematic|visual/.test(name)) {
    capabilities.push("visual_first")
  }

  return uniq(capabilities)
}

export function inferPackagingTemplateCapabilities(
  detail: ShanjianTemplateDetail,
): string[] {
  const editInfo = detail.videoStructInfo?.editInfo
  if (!editInfo) {
    return normalizePackagingTemplateCapabilities({
      name: detail.name,
    })
  }

  const capabilities: string[] = []

  if (hasTemplateLayer(editInfo.headerLayer)) {
    capabilities.push("strong_title")
  }
  if (hasTemplateLayer(editInfo.subtitleLayer)) {
    capabilities.push("subtitle")
    if (
      editInfo.canvas?.height
      && editInfo.subtitleLayer.height / editInfo.canvas.height >= 0.09
    ) {
      capabilities.push("heavy_subtitle")
    }
  }
  if (hasTemplateLayer(editInfo.ipLayer)) {
    capabilities.push("identity_card")
  }

  return normalizePackagingTemplateCapabilities({
    capabilities,
    name: detail.name,
  })
}

export function buildStructurePackagingIntent(
  blueprint: StructureBlueprint,
): ApiStructurePackagingIntent {
  if (blueprint.packagingIntent) {
    return {
      subtitleStyle: blueprint.packagingIntent.subtitleStyle,
      visualPriority: blueprint.packagingIntent.visualPriority,
      preferredTemplateCapabilities: uniq([
        ...(blueprint.packagingIntent.preferredTemplateCapabilities ?? []),
      ]),
      requiredTemplateCapabilities: uniq([
        ...(blueprint.packagingIntent.requiredTemplateCapabilities ?? []),
      ]),
      recommendedMaterialRoles: uniq([
        ...(blueprint.packagingIntent.recommendedMaterialRoles ?? []),
      ]),
      bgmGuidance: blueprint.packagingIntent.bgmGuidance,
      defaultPackRules: asJsonRecord(blueprint.packagingIntent.defaultPackRules),
      defaultProcessRules: asJsonRecord(blueprint.packagingIntent.defaultProcessRules),
    }
  }

  const subtitleStyle =
    blueprint.evidenceDensity === "high"
      ? "highlight"
      : blueprint.pace === "slow"
        ? "minimal"
        : "standard"
  const visualPriority =
    blueprint.evidenceDensity === "high"
      ? "balanced"
      : blueprint.pace === "fast"
        ? "talking_head"
        : "balanced"
  const preferredTemplateCapabilities = uniq([
    subtitleStyle !== "minimal" ? "subtitle" : "",
    subtitleStyle === "highlight" ? "heavy_subtitle" : "",
    visualPriority === "talking_head" ? "identity_card" : "",
    blueprint.evidenceDensity === "high" ? "evidence_insert" : "",
  ].filter(Boolean))
  const recommendedMaterialRoles =
    blueprint.evidenceDensity === "high"
      ? ["product_detail", "store_environment", "process"]
      : blueprint.evidenceDensity === "low"
        ? ["store_environment"]
        : ["product_detail", "process"]

  return {
    subtitleStyle,
    visualPriority,
    preferredTemplateCapabilities,
    requiredTemplateCapabilities: [],
    recommendedMaterialRoles,
    bgmGuidance:
      blueprint.pace === "fast"
        ? "偏节奏推动，避免情绪过慢"
        : blueprint.pace === "slow"
          ? "偏轻氛围或情绪共鸣，避免抢戏"
          : "保持稳定推进，不要抢人口播",
    defaultPackRules: {
      headerSwitch: preferredTemplateCapabilities.includes("strong_title"),
      materialSwitch: recommendedMaterialRoles.length > 0,
      subtitleSwitch: subtitleStyle !== "minimal",
      keywordSwitch: subtitleStyle === "highlight",
    },
    defaultProcessRules: {
      materialMatchWay: blueprint.evidenceDensity === "high" ? "preciseMatch" : "fuzzyMatch",
      materialComposition: blueprint.pace === "fast" ? "random" : "order",
    },
  }
}

function buildCompatiblePresetPackRules(
  capabilities: Set<string>,
  intent: ApiStructurePackagingIntent,
): JsonRecord | null {
  const base = asJsonRecord(intent.defaultPackRules) ?? {}
  const rules: JsonRecord = { ...base }

  if (!capabilities.has("strong_title")) {
    rules.headerSwitch = false
  }
  if (!capabilities.has("subtitle")) {
    rules.subtitleSwitch = false
    rules.keywordSwitch = false
  } else if (!capabilities.has("heavy_subtitle") && rules.keywordSwitch === true) {
    rules.keywordSwitch = false
  }
  if (!capabilities.has("evidence_insert")) {
    rules.materialSwitch = false
  }

  return Object.keys(rules).length > 0 ? rules : null
}

function buildCompatiblePresetProcessRules(
  capabilities: Set<string>,
  intent: ApiStructurePackagingIntent,
): JsonRecord | null {
  const base = asJsonRecord(intent.defaultProcessRules) ?? {}
  const rules: JsonRecord = { ...base }

  if (!capabilities.has("evidence_insert")) {
    delete rules.materialMatchWay
    delete rules.materialComposition
  }

  return Object.keys(rules).length > 0 ? rules : null
}

function getRecommendationTier(score: number): RecommendationTier {
  if (score >= 78) return "recommended"
  if (score >= 60) return "acceptable"
  return "weak_fit"
}

export function recommendPackagingTemplate(input: {
  template: {
    id: string
    name: string
    description?: string | null
    capabilities?: unknown
  }
  structureBlueprint: StructureBlueprint
  scriptContent?: string | null
  structureId?: string | null
  scriptId?: string | null
}): ApiPackagingTemplateRecommendation {
  const normalizedCapabilities = normalizePackagingTemplateCapabilities({
    capabilities: input.template.capabilities,
    name: input.template.name,
    description: input.template.description ?? null,
  })
  const capabilities = new Set(normalizedCapabilities)
  const intent = buildStructurePackagingIntent(input.structureBlueprint)
  const scriptLength = input.scriptContent?.trim().length ?? 0
  const missingRequired = (intent.requiredTemplateCapabilities ?? []).filter(
    (capability) => !capabilities.has(capability),
  )

  if (missingRequired.length > 0) {
    return {
      tier: "blocked",
      score: 0,
      reasons: [],
      blockingReasons: missingRequired.map(
        (capability) => `缺少 ${PACKAGING_CAPABILITY_LABELS[capability] ?? capability}`,
      ),
      presetPackRules: buildCompatiblePresetPackRules(capabilities, intent),
      presetProcessRules: buildCompatiblePresetProcessRules(capabilities, intent),
      recommendedMaterialRoles: intent.recommendedMaterialRoles,
      bgmGuidance: intent.bgmGuidance,
    }
  }

  let score = 55
  const reasons: string[] = []

  const preferredMatches = intent.preferredTemplateCapabilities.filter((capability) =>
    capabilities.has(capability),
  )
  if (preferredMatches.length > 0) {
    score += preferredMatches.length * 8
    reasons.push(
      `更贴合当前结构偏好的 ${preferredMatches
        .map((capability) => PACKAGING_CAPABILITY_LABELS[capability] ?? capability)
        .join(" / ")}`,
    )
  }

  if (intent.subtitleStyle === "highlight") {
    if (capabilities.has("heavy_subtitle")) {
      score += 10
      reasons.push("强字幕承载更适合当前结构的节奏和信息密度")
    } else if (!capabilities.has("subtitle")) {
      score -= 10
      reasons.push("字幕承载偏弱，表达冲击力会下降")
    }
  } else if (intent.subtitleStyle === "chapter") {
    if (capabilities.has("strong_title") || capabilities.has("subtitle")) {
      score += 8
      reasons.push("更适合做分段表达和章节推进")
    }
  } else if (intent.subtitleStyle === "minimal" && capabilities.has("visual_first")) {
    score += 8
    reasons.push("更适合让画面承担主要表达")
  }

  if (intent.visualPriority === "visual_first") {
    if (capabilities.has("visual_first") || capabilities.has("evidence_insert") || capabilities.has("pip")) {
      score += 10
      reasons.push("更适合画面先行的观看体验")
    } else {
      score -= 4
    }
  } else if (intent.visualPriority === "talking_head" && capabilities.has("identity_card")) {
    score += 6
    reasons.push("更适合稳定的人像口播表达")
  }

  if (scriptLength >= 220) {
    if (capabilities.has("heavy_subtitle")) {
      score += 6
      reasons.push("长文案下更能承接字幕信息量")
    } else if (!capabilities.has("subtitle")) {
      score -= 8
    }
  } else if (scriptLength > 0 && scriptLength <= 120 && capabilities.has("visual_first")) {
    score += 4
    reasons.push("短文案下更容易把注意力放到画面节奏")
  }

  const clampedScore = clampScore(score)
  return {
    tier: getRecommendationTier(clampedScore),
    score: clampedScore,
    reasons: reasons.slice(0, 3),
    presetPackRules: buildCompatiblePresetPackRules(capabilities, intent),
    presetProcessRules: buildCompatiblePresetProcessRules(capabilities, intent),
    recommendedMaterialRoles: intent.recommendedMaterialRoles,
    bgmGuidance: intent.bgmGuidance,
  }
}

export function buildPackagingRecommendationContext(input: {
  structureId: string | null
  scriptId: string | null
  packagingTemplateId: string | null
  recommendation: ApiPackagingTemplateRecommendation | null | undefined
}): ApiPackagingRecommendationContext | null {
  if (!input.recommendation) return null

  return {
    structureId: input.structureId,
    scriptId: input.scriptId,
    packagingTemplateId: input.packagingTemplateId,
    tier: input.recommendation.tier,
    score: input.recommendation.score,
    reasons: input.recommendation.reasons,
    recommendedMaterialRoles: input.recommendation.recommendedMaterialRoles ?? [],
    bgmGuidance: input.recommendation.bgmGuidance ?? null,
  }
}
