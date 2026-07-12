import { LLMClient } from "@/lib/llm/client"
import { INDUSTRY_INFER_MODEL, type InferredIndustry } from "./contracts"

const ARCHETYPES = [
  "HVAC technician air conditioning", "baker pastry bakery", "postnatal care newborn",
  "carpenter woodwork furniture", "medical aesthetic beauty treatment", "restaurant kitchen food",
  "fitness gym workout", "auto mechanic car service", "education classroom training",
  "retail store merchandise", "real estate property home", "lawyer legal office consultation",
  "dentist dental clinic", "hair salon stylist", "photography studio portrait", "pet care veterinary",
  "early childhood daycare", "home cleaning housekeeping", "logistics delivery warehouse",
  "florist flower arrangement", "professional service business",
] as const;

const VISUAL_ARCHETYPES: Array<[RegExp, string]> = [
  [/空调|暖通|hvac/i, "HVAC technician air conditioning"], [/烘焙|面包|蛋糕|甜品/i, "baker pastry bakery"],
  [/月子|产后|母婴/i, "postnatal care newborn"], [/家具|衣柜|木工|定制/i, "carpenter woodwork furniture"],
  [/美容|整形|医美|皮肤/i, "medical aesthetic beauty treatment"], [/餐饮|火锅|餐厅|厨师/i, "restaurant kitchen food"],
  [/健身|瑜伽|体育|运动/i, "fitness gym workout"], [/汽车|车|洗车|修车/i, "auto mechanic car service"],
  [/教育|培训|辅导|课程/i, "education classroom training"], [/零售|服装|时装|商店/i, "retail store merchandise"],
  [/房产|地产|房屋|置业/i, "real estate property home"], [/法律|律师|法务/i, "lawyer legal office consultation"],
  [/牙科|口腔|牙医/i, "dentist dental clinic"], [/美发|理发|发型/i, "hair salon stylist"],
  [/摄影|拍照|写真/i, "photography studio portrait"], [/宠物|猫|狗/i, "pet care veterinary"],
  [/早教|幼儿|托育/i, "early childhood daycare"], [/保洁|家政|清洁/i, "home cleaning housekeeping"],
  [/物流|快递|配送/i, "logistics delivery warehouse"], [/花店|花艺|鲜花/i, "florist flower arrangement"],
];

export function resolveVisualArchetype(industry?: string | null, primaryOffer?: string | null): string {
  const combined = `${industry ?? ""} ${primaryOffer ?? ""}`.toLowerCase();
  return VISUAL_ARCHETYPES.find(([pattern]) => pattern.test(combined))?.[1] ?? "professional service business";
}

function buildIndustrySignals(input: Parameters<typeof inferIndustryFromContent>[0]): string {
  return [
    input.ipName && `IP名称：${input.ipName}`,
    input.storedIndustry && `填写行业：${input.storedIndustry}`,
    input.primaryOffer && `主打内容：${input.primaryOffer}`,
    input.targetAudience && `目标受众：${input.targetAudience}`,
    `文案前150字：${input.scriptExcerpt.slice(0, 150)}`,
  ].filter(Boolean).join("\n");
}

function normalizeInferredIndustry(value: string): InferredIndustry | null {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  const industry = typeof parsed.industry === "string" ? parsed.industry.trim() : "";
  const archetype = typeof parsed.archetype === "string" ? parsed.archetype.trim() : "";
  if (!industry || !archetype) return null;
  return { industry, archetype: ARCHETYPES.includes(archetype as typeof ARCHETYPES[number]) ? archetype : "professional service business" };
}

export async function inferIndustryFromContent(input: {
  ipName?: string | null; storedIndustry?: string | null; primaryOffer?: string | null;
  targetAudience?: string | null; scriptExcerpt: string;
}): Promise<InferredIndustry | null> {
  const llm = LLMClient.shared();
  if (!llm.available) return null;
  try {
    const result = await llm.complete({
      model: INDUSTRY_INFER_MODEL,
      messages: [{ role: "system", content: `你是行业分类专家。根据用户的 IP 信息和文案内容，判断该用户的真实行业。
注意：用户填写的行业可能不准确，请综合所有信号判断。

已知的视觉原型列表：
${ARCHETYPES.join("\n")}

输出 JSON：{"industry":"中文行业名","archetype":"从上面列表中选一个最匹配的"}
如果所有原型都不匹配，archetype 用 "professional service business"。` }, { role: "user", content: buildIndustrySignals(input) }],
      temperature: 0, maxTokens: 100, responseFormat: { type: "json_object" },
    });
    const normalized = normalizeInferredIndustry(result.content);
    if (normalized) {
      console.log(`[packaging-material-suggestions] inferIndustryFromContent: stored="${input.storedIndustry}", inferred="${normalized.industry}", archetype="${normalized.archetype}"`);
    }
    return normalized;
  } catch (error) {
    console.warn("[packaging-material-suggestions] inferIndustryFromContent failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
