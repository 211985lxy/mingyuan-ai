import { LLMClient } from "@/lib/llm/client"
import { SAFE_AI_MATERIAL_ROLES } from "@/lib/packaging-materials"
import { MATERIAL_PLAN_MODEL, type SafeRole, type SearchPlanEntry, type SearchPlanInput, type SearchPlanResult } from "./contracts"
import { getFallbackQuery, getPreferredMediaType } from "./fallback-plan"
import { clamp, distributeCounts } from "./plan-utils"

const SYSTEM_PROMPT = `你是包装层素材规划助手。目标是为一条营销短视频补充通用支持型画面素材，query 必须精准匹配用户的具体行业和业务内容。

只能使用这些角色：
- product_detail
- store_environment
- process

禁止输出这些角色：
- customer_case
- qualification
- before_after

【行业视觉词汇表】
以下是常见行业对应的英文图库搜索关键词，query 必须优先使用这些词汇：
- 空调维修/暖通: HVAC technician, outdoor unit, air conditioning equipment, ductwork, compressor
- 烘焙/面包店: baker, bread dough, oven, pastry, flour, croissant, bakery
- 医疗美容/整形: medical aesthetic, beauty treatment, facial treatment, clinic interior, skincare
- 定制家具/衣柜: carpenter, woodwork, furniture installation, cabinet, wood grain
- 月子中心/产后护理: newborn care, nurse, postnatal, mother infant, nursery room
- 餐饮/火锅/餐厅: restaurant kitchen, food plating, chef, dining table, cooking
- 健身/瑜伽: fitness trainer, yoga pose, gym equipment, workout, exercise
- 教育/培训: classroom, teacher, student, learning, study, education
- 汽车美容/维修: car detailing, mechanic, auto repair, garage, vehicle
- 零售/服装: retail store, clothing rack, fashion display, shopping, merchandise
- 房产/地产: real estate, property, home interior, house exterior, architecture
- 法律/律师: lawyer, legal office, consultation, courtroom, contract
- 牙科/口腔: dentist, dental clinic, teeth, oral care, dental equipment
- 美发/理发: hair salon, stylist, hairdressing, beauty chair, scissors
- 摄影/写真: photography studio, portrait, camera, lighting setup, photo shoot
- 宠物/猫狗: pet care, veterinary, dog grooming, cat, animal clinic
- 早教/幼儿: early childhood, daycare, children playing, learning toys, nursery
- 保洁/家政: home cleaning, housekeeping, cleaning supplies, mop, tidy room
- 物流/快递: logistics, delivery, warehouse, package, shipping
- 花店/花艺: florist, flower arrangement, bouquet, flower shop, floral design
如果用户的行业不在上表，请根据行业本质推断最接近的英文视觉描述词。

角色语义规范（必须遵守）：
- product_detail: 聚焦产品/服务工具的特写镜头。query 应描述实物物体、设备细节、材质纹理。
  示例: "air conditioning unit close-up", "woodworking chisel detail", "dental equipment close-up"
- store_environment: 聚焦经营场所的空间感。query 应描述室内或工作场地的整体环境。
  示例: "bakery shop interior", "auto repair garage workshop", "dental clinic interior"
- process: 聚焦人物正在执行专业操作的动态画面。query 应描述具体工作过程。
  示例: "HVAC technician installing outdoor unit", "baker kneading bread dough", "dentist examining patient"

【正确示例 vs 错误示例】

错误：行业=空调维修，role=product_detail → query="repair work detail" （太泛，Pexels 返回不相关结果）
正确：行业=空调维修，role=product_detail → query="air conditioning outdoor compressor unit close-up"

错误：行业=烘焙，role=process → query="food making process" （太泛）
正确：行业=烘焙，role=process → query="baker kneading bread dough hands"

错误：行业=月子中心，role=store_environment → query="health center interior" （太泛）
正确：行业=月子中心，role=store_environment → query="postnatal care room newborn nursery warm"

输出要求：
1. 仅返回 JSON
2. JSON 结构必须是 {"queries":[{"role":"product_detail","mediaType":"image","rationale":"推理过程","query":"english keywords","count":3}]}
3. rationale 字段：用中文简述为何选择这个 query（不超过30字），写在 query 之前
4. query 字段只允许英文单词，不得包含任何中文字符
5. query 必须包含行业特定的视觉主体词，禁止使用 "small business"、"work process"、"service detail" 等泛化词汇
6. mediaType 只能是 image 或 video，process 优先 video，其它角色默认 image
7. 每个 count 必须是正整数
8. 所有 count 总和尽量接近 REQUESTED_COUNT
9. 不要输出人脸特写，不要输出品牌名，不要输出假资质或假案例`;

function buildUserPrompt(input: SearchPlanInput): string {
  return `包装模板：${input.packagingTemplateName}

IP 档案：
${input.ipProfileSnapshot}

当前脚本：
${input.scriptContent}

当前已有包装项：
${JSON.stringify(input.existingItems.map((item) => ({ role: item.role, source: item.source ?? "manual", hasFile: Boolean(item.fileUrl) })))}

请规划 ${input.maxCount} 条以内的支持型素材搜索计划。`;
}

function normalizeResponse(content: string): Array<{ role: SafeRole; mediaType: "image" | "video"; query: string; count: number }> {
  const raw = content.trim().replace(/```(?:json)?\s*([\s\S]*?)```/, "$1");
  const parsed = JSON.parse(raw) as { queries?: Array<{ role?: string; mediaType?: string; query?: string; count?: number }> };
  if (!Array.isArray(parsed.queries)) return [];
  return parsed.queries.map((entry) => ({
    role: entry.role as SafeRole,
    mediaType: entry.mediaType === "video" || entry.mediaType === "image" ? entry.mediaType : getPreferredMediaType(entry.role as SafeRole),
    query: typeof entry.query === "string" ? entry.query.trim() : "",
    count: typeof entry.count === "number" && Number.isFinite(entry.count) ? Math.floor(entry.count) : 0,
  })).filter((entry) => SAFE_AI_MATERIAL_ROLES.includes(entry.role) && entry.query.length > 0 && entry.count > 0);
}

function rescalePlan(entries: ReturnType<typeof normalizeResponse>, input: SearchPlanInput): SearchPlanEntry[] {
  const total = clamp(entries.reduce((sum, entry) => sum + entry.count, 0), 1, input.maxCount);
  return distributeCounts(entries.map((entry) => entry.role), total).map(({ role, count }, index) => {
    const entry = entries.find((candidate, entryIndex) => candidate.role === role && entryIndex >= index);
    return { role, count, mediaType: entry?.mediaType ?? getPreferredMediaType(role), query: entry?.query ?? getFallbackQuery(role, input) };
  });
}

export async function buildLlmSearchPlan(input: SearchPlanInput, fallback: SearchPlanResult): Promise<SearchPlanResult> {
  const llm = LLMClient.shared();
  if (!llm.available) return fallback;
  try {
    const result = await llm.complete({
      model: MATERIAL_PLAN_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT.replace("REQUESTED_COUNT", String(input.maxCount)) }, { role: "user", content: buildUserPrompt(input) }],
      maxTokens: 1200, responseFormat: { type: "json_object" },
    });
    const entries = normalizeResponse(result.content);
    return entries.length > 0 ? { source: "llm", queries: rescalePlan(entries, input) } : fallback;
  } catch (error) {
    console.warn("[packaging-material-suggestions] LLM planning failed, using deterministic fallback:", error instanceof Error ? error.message : error);
    return fallback;
  }
}
