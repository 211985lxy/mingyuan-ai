import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import { LLMClient } from "@/lib/llm/client";
import {
  computeQueryHash,
  searchPhotos,
  searchVideos,
  selectBestVideoFile,
} from "@/lib/pexels";
import {
  searchImages as searchPixabayImages,
  computeQueryHash as pixabayQueryHash,
} from "@/lib/pixabay";
import { transferPexelsMediaToOss } from "@/lib/pexels-oss";
import { generateSignedUrl } from "@/lib/oss";
import {
  getSuggestedMaterialCount,
  SAFE_AI_MATERIAL_ROLES,
  splitMaterialAssignments,
} from "@/lib/packaging-materials";
import {
  scoreAndFilterMedia,
  generateAbstractFallbackQueries,
} from "@/lib/material-relevance";
import { buildStructurePackagingIntent } from "@/lib/video-template-config";
import type { MaterialAssignment, PackagingMaterialSource } from "@/types/api";
import type {
  PexelsPhoto,
  PexelsVideo,
  PexelsVideoFile,
  PexelsVideoPicture,
} from "@/types/pexels";

const MATERIAL_PLAN_MODEL =
  process.env.PACKAGING_MATERIAL_PLAN_MODEL || "openai/gpt-5-mini";
const INDUSTRY_INFER_MODEL =
  process.env.PACKAGING_MATERIAL_PLAN_MODEL || "openai/gpt-5-mini";
const SEARCH_LOCALE = "en-US";
const SEARCH_ORIENTATION = "landscape";
const SEARCH_SIZE = "large";

/**
 * Cache schema version — increment when query strategy or scoring logic changes.
 * Baked into computeQueryHash so old cache entries become automatic misses.
 * v1: Pre-scoring era (Phase 1-2)
 * v2: Phase 3 relevance scoring deployed — all v1 entries auto-invalidated
 */
const CACHE_SCHEMA_VERSION = 2;

type SafeRole = (typeof SAFE_AI_MATERIAL_ROLES)[number];

interface SearchPlanEntry {
  role: SafeRole;
  mediaType: "image" | "video";
  query: string;
  count: number;
}

interface SearchPlanResult {
  source: "llm" | "deterministic" | "abstract_fallback";
  queries: SearchPlanEntry[];
}

type CachedPhotoRow = {
  id: string;
  pexelsId: number;
  provider: "pexels" | "pixabay";
  mediaType: "photo" | "video";
  url: string;
  alt: string | null;
  imageUrl: string | null;
  srcJson: unknown;
  videoFilesJson: unknown;
  videoPicturesJson: unknown;
  ossUrl: string | null;
  ossStatus: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distributeCounts(
  roles: SafeRole[],
  total: number,
): Array<{ role: SafeRole; count: number }> {
  if (roles.length === 0) {
    return [];
  }

  const counts = roles.map((role) => ({
    role,
    count: Math.floor(total / roles.length),
  }));

  let remainder = total % roles.length;
  let index = 0;
  while (remainder > 0) {
    counts[index % counts.length].count += 1;
    remainder -= 1;
    index += 1;
  }

  return counts.filter((item) => item.count > 0);
}

function resolveVisualArchetype(
  industry?: string | null,
  primaryOffer?: string | null,
): string {
  const combined = `${industry ?? ""} ${primaryOffer ?? ""}`.toLowerCase();
  if (/空调|暖通|hvac/i.test(combined)) return "HVAC technician air conditioning";
  if (/烘焙|面包|蛋糕|甜品/i.test(combined)) return "baker pastry bakery";
  if (/月子|产后|母婴/i.test(combined)) return "postnatal care newborn";
  if (/家具|衣柜|木工|定制/i.test(combined)) return "carpenter woodwork furniture";
  if (/美容|整形|医美|皮肤/i.test(combined)) return "medical aesthetic beauty treatment";
  if (/餐饮|火锅|餐厅|厨师/i.test(combined)) return "restaurant kitchen food";
  if (/健身|瑜伽|体育|运动/i.test(combined)) return "fitness gym workout";
  if (/汽车|车|洗车|修车/i.test(combined)) return "auto mechanic car service";
  if (/教育|培训|辅导|课程/i.test(combined)) return "education classroom training";
  if (/零售|服装|时装|商店/i.test(combined)) return "retail store merchandise";
  if (/房产|地产|房屋|置业/i.test(combined)) return "real estate property home";
  if (/法律|律师|法务/i.test(combined)) return "lawyer legal office consultation";
  if (/牙科|口腔|牙医/i.test(combined)) return "dentist dental clinic";
  if (/美发|理发|发型/i.test(combined)) return "hair salon stylist";
  if (/摄影|拍照|写真/i.test(combined)) return "photography studio portrait";
  if (/宠物|猫|狗/i.test(combined)) return "pet care veterinary";
  if (/早教|幼儿|托育/i.test(combined)) return "early childhood daycare";
  if (/保洁|家政|清洁/i.test(combined)) return "home cleaning housekeeping";
  if (/物流|快递|配送/i.test(combined)) return "logistics delivery warehouse";
  if (/花店|花艺|鲜花/i.test(combined)) return "florist flower arrangement";
  // Generic last resort — better than "small business"
  console.warn("[packaging-material-suggestions] resolveVisualArchetype: no match for", combined.trim());
  return "professional service business";
}

// ─── LLM-based industry inference ──────────────────────────

/** Known visual archetypes (same keys as INDUSTRY_ABSTRACT_QUERY_MAP). */
const KNOWN_ARCHETYPES = [
  "HVAC technician air conditioning",
  "baker pastry bakery",
  "postnatal care newborn",
  "carpenter woodwork furniture",
  "medical aesthetic beauty treatment",
  "restaurant kitchen food",
  "fitness gym workout",
  "auto mechanic car service",
  "education classroom training",
  "retail store merchandise",
  "real estate property home",
  "lawyer legal office consultation",
  "dentist dental clinic",
  "hair salon stylist",
  "photography studio portrait",
  "pet care veterinary",
  "early childhood daycare",
  "home cleaning housekeeping",
  "logistics delivery warehouse",
  "florist flower arrangement",
  "professional service business",
] as const;

interface InferredIndustry {
  /** Chinese industry label (e.g. "房地产") */
  industry: string;
  /** English visual archetype from KNOWN_ARCHETYPES */
  archetype: string;
}

/**
 * Infer the ACTUAL industry from content signals (IP name, offer, audience,
 * script), independent of the stored industry field which may be wrong.
 *
 * Uses a fast, low-token LLM call (~200 input tokens, ~50 output tokens).
 * Falls back to regex-based resolution on failure.
 */
async function inferIndustryFromContent(input: {
  ipName?: string | null;
  storedIndustry?: string | null;
  primaryOffer?: string | null;
  targetAudience?: string | null;
  scriptExcerpt: string;
}): Promise<InferredIndustry | null> {
  const llm = LLMClient.shared();
  if (!llm.available) return null;

  const signals = [
    input.ipName && `IP名称：${input.ipName}`,
    input.storedIndustry && `填写行业：${input.storedIndustry}`,
    input.primaryOffer && `主打内容：${input.primaryOffer}`,
    input.targetAudience && `目标受众：${input.targetAudience}`,
    `文案前150字：${input.scriptExcerpt.slice(0, 150)}`,
  ].filter(Boolean).join("\n");

  try {
    const result = await llm.complete({
      model: INDUSTRY_INFER_MODEL,
      messages: [
        {
          role: "system",
          content: `你是行业分类专家。根据用户的 IP 信息和文案内容，判断该用户的真实行业。
注意：用户填写的行业可能不准确，请综合所有信号判断。

已知的视觉原型列表：
${KNOWN_ARCHETYPES.join("\n")}

输出 JSON：{"industry":"中文行业名","archetype":"从上面列表中选一个最匹配的"}
如果所有原型都不匹配，archetype 用 "professional service business"。`,
        },
        { role: "user", content: signals },
      ],
      temperature: 0,
      maxTokens: 100,
      responseFormat: { type: "json_object" },
    });

    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    const industry = typeof parsed.industry === "string" ? parsed.industry.trim() : "";
    const archetype = typeof parsed.archetype === "string" ? parsed.archetype.trim() : "";

    if (!industry || !archetype) return null;

    // Validate archetype is from the known list
    const validArchetype = KNOWN_ARCHETYPES.includes(archetype as typeof KNOWN_ARCHETYPES[number])
      ? archetype
      : "professional service business";

    console.log(`[packaging-material-suggestions] inferIndustryFromContent: stored="${input.storedIndustry}", inferred="${industry}", archetype="${validArchetype}"`);

    return { industry, archetype: validArchetype };
  } catch (error) {
    console.warn("[packaging-material-suggestions] inferIndustryFromContent failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function getFallbackQuery(role: SafeRole, input: {
  industry?: string | null;
  primaryOffer?: string | null;
  targetAudience?: string | null;
}): string {
  const englishArchetype = resolveVisualArchetype(input.industry, input.primaryOffer);
  switch (role) {
    case "product_detail":
      return `${englishArchetype} detail close-up`;
    case "store_environment":
      return `${englishArchetype} workplace interior`;
    case "process":
      return `${englishArchetype} professional work`;
  }
}

function getPreferredMediaType(role: SafeRole): "image" | "video" {
  return role === "process" ? "video" : "image";
}

async function buildSearchPlan(input: {
  existingItems: MaterialAssignment[];
  maxCount: number;
  packagingTemplateName: string;
  scriptContent: string;
  ipProfileSnapshot: string;
  preferredRoles?: SafeRole[];
  industry?: string | null;
  primaryOffer?: string | null;
  targetAudience?: string | null;
}): Promise<SearchPlanResult> {
  const { manual } = splitMaterialAssignments(input.existingItems);
  const occupiedManualRoles = new Set(
    manual
      .map((item) => item.role.trim())
      .filter((role): role is SafeRole =>
        SAFE_AI_MATERIAL_ROLES.includes(role as SafeRole),
      ),
  );
  const availableRoles = SAFE_AI_MATERIAL_ROLES.filter(
    (role) => !occupiedManualRoles.has(role),
  );
  const preferredRoleSet = new Set(input.preferredRoles ?? []);
  const chosenRoles = availableRoles.length > 0
    ? [...availableRoles].sort((left, right) => {
        const leftRank = preferredRoleSet.has(left) ? 0 : 1;
        const rightRank = preferredRoleSet.has(right) ? 0 : 1;
        return leftRank - rightRank;
      })
    : [...SAFE_AI_MATERIAL_ROLES];

  const fallbackCounts = distributeCounts(chosenRoles, input.maxCount);
  const fallback: SearchPlanResult = {
    source: "deterministic",
    queries: fallbackCounts.map(({ role, count }) => ({
      role,
      mediaType: getPreferredMediaType(role),
      count,
      query: getFallbackQuery(role, input),
    })),
  };

  const llm = LLMClient.shared();
  if (!llm.available) {
    return fallback;
  }

  const systemPrompt = `你是包装层素材规划助手。目标是为一条营销短视频补充通用支持型画面素材，query 必须精准匹配用户的具体行业和业务内容。

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
8. 所有 count 总和尽量接近 ${input.maxCount}
9. 不要输出人脸特写，不要输出品牌名，不要输出假资质或假案例`;

  const userPrompt = `包装模板：${input.packagingTemplateName}

IP 档案：
${input.ipProfileSnapshot}

当前脚本：
${input.scriptContent}

当前已有包装项：
${JSON.stringify(input.existingItems.map((item) => ({
    role: item.role,
    source: item.source ?? "manual",
    hasFile: Boolean(item.fileUrl),
  })))}

请规划 ${input.maxCount} 条以内的支持型素材搜索计划。`;

  try {
    const result = await llm.complete({
      model: MATERIAL_PLAN_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
    });

    let raw = result.content.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      raw = fence[1].trim();
    }

    const parsed = JSON.parse(raw) as {
      queries?: Array<{
        role?: string;
        mediaType?: string;
        query?: string;
        rationale?: string;
        count?: number;
      }>;
    };

    const normalizedQueries = Array.isArray(parsed.queries)
      ? parsed.queries
          .map((entry) => ({
            role: entry.role,
            mediaType:
              entry.mediaType === "video" || entry.mediaType === "image"
                ? entry.mediaType
                : getPreferredMediaType(entry.role as SafeRole),
            query: typeof entry.query === "string" ? entry.query.trim() : "",
            count:
              typeof entry.count === "number" && Number.isFinite(entry.count)
                ? Math.floor(entry.count)
                : 0,
          }))
          .filter(
            (entry): entry is SearchPlanEntry =>
              SAFE_AI_MATERIAL_ROLES.includes(entry.role as SafeRole) &&
              (entry.mediaType === "image" || entry.mediaType === "video") &&
              entry.query.length > 0 &&
              entry.count > 0,
          )
      : [];

    if (normalizedQueries.length === 0) {
      return fallback;
    }

    const boundedTotal = clamp(
      normalizedQueries.reduce((sum, entry) => sum + entry.count, 0),
      1,
      input.maxCount,
    );

    const rescaled = distributeCounts(
      normalizedQueries.map((entry) => entry.role),
      boundedTotal,
    );

    const queries = rescaled.map(({ role, count }, index) => ({
      role,
      mediaType:
        normalizedQueries.find(
          (entry, queryIndex) =>
            entry.role === role && queryIndex >= index,
        )?.mediaType ?? getPreferredMediaType(role),
      count,
      query:
        normalizedQueries.find(
          (entry, queryIndex) =>
            entry.role === role && queryIndex >= index,
        )?.query ??
        getFallbackQuery(role, input),
    }));

    return {
      source: "llm",
      queries,
    };
  } catch (error) {
    console.warn(
      "[packaging-material-suggestions] LLM planning failed, using deterministic fallback:",
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}

function normalizePhoto(photo: PexelsPhoto): {
  pexelsId: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string | null;
  photographerId: number | null;
  avgColor: string | null;
  alt: string | null;
  srcJson: Prisma.InputJsonValue;
} {
  return {
    pexelsId: photo.id,
    width: photo.width,
    height: photo.height,
    url: photo.url,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    photographerId: photo.photographer_id,
    avgColor: photo.avg_color,
    alt: photo.alt,
    srcJson: JSON.parse(JSON.stringify(photo.src)) as Prisma.InputJsonValue,
  };
}

async function loadPhotosForQuery(
  query: string,
  perPage: number,
): Promise<CachedPhotoRow[]> {
  const queryHash = computeQueryHash({
    query,
    mediaType: "photo",
    orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE,
    locale: SEARCH_LOCALE,
    page: 1,
    perPage,
    schemaVersion: CACHE_SCHEMA_VERSION,
  });

  const cached = await prisma.pexelsQueryCache.findUnique({
    where: { queryHash },
  });

  if (cached) {
    const pexelsIds = cached.pexelsIds as number[];
    const rows = await prisma.pexelsMedia.findMany({
      where: { provider: "pexels", pexelsId: { in: pexelsIds } },
      select: {
        id: true,
        pexelsId: true,
        mediaType: true,
        url: true,
        alt: true,
        imageUrl: true,
        srcJson: true,
        videoFilesJson: true,
        videoPicturesJson: true,
        ossUrl: true,
        ossStatus: true,
      },
    });
    return pexelsIds
      .map((pid) => rows.find((row) => row.pexelsId === pid))
      .filter((r): r is (typeof rows)[number] => r != null)
      .map((row) => ({ ...row, provider: "pexels" as const } as CachedPhotoRow));
  }

  const response = await searchPhotos(query, {
    orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE,
    locale: SEARCH_LOCALE,
    page: 1,
    perPage,
  });

  const pexelsIds: number[] = [];
  for (const photo of response.photos) {
    const normalized = normalizePhoto(photo);
    await prisma.pexelsMedia.upsert({
      where: { provider_pexelsId: { provider: "pexels", pexelsId: photo.id } },
      create: {
        provider: "pexels",
        pexelsId: photo.id,
        mediaType: "photo",
        width: normalized.width,
        height: normalized.height,
        url: normalized.url,
        photographer: normalized.photographer,
        photographerUrl: normalized.photographerUrl,
        photographerId: normalized.photographerId,
        avgColor: normalized.avgColor,
        alt: normalized.alt,
        srcJson: normalized.srcJson,
        discoveryQuery: query,
      },
      update: {
        updatedAt: new Date(),
      },
    });
    pexelsIds.push(photo.id);
  }

  await prisma.pexelsQueryCache.upsert({
    where: { queryHash },
    create: {
      provider: "pexels",
      queryHash,
      query,
      mediaType: "photo",
      orientation: SEARCH_ORIENTATION,
      size: SEARCH_SIZE,
      color: null,
      schemaVersion: CACHE_SCHEMA_VERSION,
      totalResults: response.total_results,
      pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
    },
    update: {
      pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
      totalResults: response.total_results,
      updatedAt: new Date(),
    },
  });

  const rows = await prisma.pexelsMedia.findMany({
      where: { provider: "pexels", pexelsId: { in: pexelsIds } },
      select: {
        id: true,
        pexelsId: true,
        mediaType: true,
        url: true,
        alt: true,
        imageUrl: true,
        srcJson: true,
        videoFilesJson: true,
        videoPicturesJson: true,
        ossUrl: true,
        ossStatus: true,
      },
  });

  return pexelsIds
    .map((pid) => rows.find((row) => row.pexelsId === pid))
    .filter((r): r is (typeof rows)[number] => r != null)
    .map((row) => ({ ...row, provider: "pexels" as const } as CachedPhotoRow));
}

async function loadPixabayImagesForQuery(
  query: string,
  perPage: number,
): Promise<CachedPhotoRow[]> {
  try {
    const queryHash = pixabayQueryHash({
      query,
      mediaType: "photo",
      orientation: "horizontal",
      page: 1,
      perPage,
      schemaVersion: CACHE_SCHEMA_VERSION,
    });

    // Check DB cache
    const cached = await prisma.pexelsQueryCache.findUnique({
      where: { queryHash },
    });

    if (cached) {
      const ids = cached.pexelsIds as number[];
      const rows = await prisma.pexelsMedia.findMany({
        where: { provider: "pixabay", pexelsId: { in: ids } },
        select: {
          id: true,
          pexelsId: true,
          mediaType: true,
          url: true,
          alt: true,
          imageUrl: true,
          srcJson: true,
          videoFilesJson: true,
          videoPicturesJson: true,
          ossUrl: true,
          ossStatus: true,
        },
      });
      return ids
        .map((pid) => rows.find((row) => row.pexelsId === pid))
        .filter((r): r is (typeof rows)[number] => r != null)
        .map((row) => ({ ...row, provider: "pixabay" as const } as CachedPhotoRow));
    }

    // Call Pixabay API
    const response = await searchPixabayImages(query, {
      imageType: "photo",
      orientation: "horizontal",
      safesearch: true,
      page: 1,
      perPage,
    });

    const externalIds: number[] = [];
    for (const img of response.hits) {
      const srcJson = {
        original: img.largeImageURL,
        large2x: img.largeImageURL,
        large: img.webformatURL.replace("_640", "_960"),
        medium: img.webformatURL.replace("_640", "_340"),
        small: img.previewURL,
        portrait: img.webformatURL,
        landscape: img.webformatURL,
        tiny: img.previewURL,
      };

      await prisma.pexelsMedia.upsert({
        where: { provider_pexelsId: { provider: "pixabay", pexelsId: img.id } },
        create: {
          provider: "pixabay",
          pexelsId: img.id,
          mediaType: "photo",
          width: img.webformatWidth,
          height: img.webformatHeight,
          url: img.pageURL,
          photographer: img.user,
          photographerId: img.user_id,
          alt: img.tags,
          srcJson: srcJson as unknown as Prisma.InputJsonValue,
          discoveryQuery: query,
        },
        update: { updatedAt: new Date() },
      });
      externalIds.push(img.id);
    }

    // Save query cache
    if (externalIds.length > 0) {
      await prisma.pexelsQueryCache.upsert({
        where: { queryHash },
        create: {
          provider: "pixabay",
          queryHash,
          query,
          mediaType: "photo",
          orientation: "horizontal",
          schemaVersion: CACHE_SCHEMA_VERSION,
          totalResults: response.totalHits,
          pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
        },
        update: {
          pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
          totalResults: response.totalHits,
          updatedAt: new Date(),
        },
      });
    }

    // Return from DB
    const rows = await prisma.pexelsMedia.findMany({
      where: { provider: "pixabay", pexelsId: { in: externalIds } },
      select: {
        id: true,
        pexelsId: true,
        mediaType: true,
        url: true,
        alt: true,
        imageUrl: true,
        srcJson: true,
        videoFilesJson: true,
        videoPicturesJson: true,
        ossUrl: true,
        ossStatus: true,
      },
    });

    return externalIds
      .map((pid) => rows.find((row) => row.pexelsId === pid))
      .filter((r): r is (typeof rows)[number] => r != null)
      .map((row) => ({ ...row, provider: "pixabay" as const } as CachedPhotoRow));
  } catch (error) {
    console.warn("[packaging-material-suggestions] Pixabay search failed:", error);
    return [];
  }
}

/** Search both Pexels + Pixabay in parallel, merge results. */
async function loadImagesFromAllProviders(
  query: string,
  perPage: number,
): Promise<CachedPhotoRow[]> {
  const perProvider = Math.ceil(perPage / 2);

  const [pexelsRows, pixabayRows] = await Promise.all([
    loadPhotosForQuery(query, perProvider),
    loadPixabayImagesForQuery(query, perProvider),
  ]);

  // Interleave: pexels, pixabay, pexels, pixabay...
  const merged: CachedPhotoRow[] = [];
  const maxLen = Math.max(pexelsRows.length, pixabayRows.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < pexelsRows.length) merged.push(pexelsRows[i]);
    if (i < pixabayRows.length) merged.push(pixabayRows[i]);
  }
  return merged;
}

function normalizeVideo(video: PexelsVideo): {
  pexelsId: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string | null;
  photographerId: number | null;
  duration: number;
  imageUrl: string | null;
  videoFilesJson: Prisma.InputJsonValue;
  videoPicturesJson: Prisma.InputJsonValue;
} {
  return {
    pexelsId: video.id,
    width: video.width,
    height: video.height,
    url: video.url,
    photographer: video.user.name,
    photographerUrl: video.user.url,
    photographerId: video.user.id,
    duration: video.duration,
    imageUrl: video.image,
    videoFilesJson: JSON.parse(JSON.stringify(video.video_files)) as Prisma.InputJsonValue,
    videoPicturesJson: JSON.parse(JSON.stringify(video.video_pictures)) as Prisma.InputJsonValue,
  };
}

async function loadVideosForQuery(
  query: string,
  perPage: number,
): Promise<CachedPhotoRow[]> {
  const queryHash = computeQueryHash({
    query,
    mediaType: "video",
    orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE,
    locale: SEARCH_LOCALE,
    page: 1,
    perPage,
    schemaVersion: CACHE_SCHEMA_VERSION,
  });

  const cached = await prisma.pexelsQueryCache.findUnique({
    where: { queryHash },
  });

  if (cached) {
    const pexelsIds = cached.pexelsIds as number[];
    const rows = await prisma.pexelsMedia.findMany({
      where: { provider: "pexels", pexelsId: { in: pexelsIds } },
      select: {
        id: true,
        pexelsId: true,
        mediaType: true,
        url: true,
        alt: true,
        imageUrl: true,
        srcJson: true,
        videoFilesJson: true,
        videoPicturesJson: true,
        ossUrl: true,
        ossStatus: true,
      },
    });
    return pexelsIds
      .map((pid) => rows.find((row) => row.pexelsId === pid))
      .filter((r): r is (typeof rows)[number] => r != null)
      .map((row) => ({ ...row, provider: "pexels" as const } as CachedPhotoRow));
  }

  const response = await searchVideos(query, {
    orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE,
    locale: SEARCH_LOCALE,
    page: 1,
    perPage,
  });

  const pexelsIds: number[] = [];
  for (const video of response.videos) {
    const normalized = normalizeVideo(video);
    await prisma.pexelsMedia.upsert({
      where: { provider_pexelsId: { provider: "pexels", pexelsId: video.id } },
      create: {
        provider: "pexels",
        pexelsId: video.id,
        mediaType: "video",
        width: normalized.width,
        height: normalized.height,
        url: normalized.url,
        photographer: normalized.photographer,
        photographerUrl: normalized.photographerUrl,
        photographerId: normalized.photographerId,
        duration: normalized.duration,
        imageUrl: normalized.imageUrl,
        videoFilesJson: normalized.videoFilesJson,
        videoPicturesJson: normalized.videoPicturesJson,
        discoveryQuery: query,
      },
      update: {
        updatedAt: new Date(),
      },
    });
    pexelsIds.push(video.id);
  }

  await prisma.pexelsQueryCache.upsert({
    where: { queryHash },
    create: {
      provider: "pexels",
      queryHash,
      query,
      mediaType: "video",
      orientation: SEARCH_ORIENTATION,
      size: SEARCH_SIZE,
      color: null,
      schemaVersion: CACHE_SCHEMA_VERSION,
      totalResults: response.total_results,
      pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
    },
    update: {
      pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
      totalResults: response.total_results,
      updatedAt: new Date(),
    },
  });

  const rows = await prisma.pexelsMedia.findMany({
    where: { provider: "pexels", pexelsId: { in: pexelsIds } },
    select: {
      id: true,
      pexelsId: true,
      mediaType: true,
      url: true,
      alt: true,
      imageUrl: true,
      srcJson: true,
      videoFilesJson: true,
      videoPicturesJson: true,
      ossUrl: true,
      ossStatus: true,
    },
  });

  return pexelsIds
    .map((pid) => rows.find((row) => row.pexelsId === pid))
    .filter((r): r is (typeof rows)[number] => r != null)
    .map((row) => ({ ...row, provider: "pexels" as const } as CachedPhotoRow));
}

async function loadMediaFromAllProviders(
  query: string,
  mediaType: "image" | "video",
  perPage: number,
): Promise<CachedPhotoRow[]> {
  if (mediaType === "video") {
    return loadVideosForQuery(query, perPage);
  }

  return loadImagesFromAllProviders(query, perPage);
}

function getPhotoPreviewUrls(row: CachedPhotoRow): {
  fileUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
} {
  // srcJson may be a Prisma JsonValue; extract as record
  const raw = row.srcJson;
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  const large = typeof src?.large === "string" ? src.large : undefined;
  const medium = typeof src?.medium === "string" ? src.medium : undefined;
  const small = typeof src?.small === "string" ? src.small : undefined;
  const tiny = typeof src?.tiny === "string" ? src.tiny : undefined;
  const original = typeof src?.original === "string" ? src.original : undefined;

  const previewUrl = row.ossUrl || large || medium || original || row.url;
  const thumbnailUrl = medium || small || tiny || previewUrl;
  return {
    fileUrl: previewUrl,
    previewUrl,
    thumbnailUrl,
  };
}

function getVideoPreviewUrls(row: CachedPhotoRow): {
  fileUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
} {
  const videoFiles = Array.isArray(row.videoFilesJson)
    ? (row.videoFilesJson as PexelsVideoFile[])
    : []
  const bestVideo = selectBestVideoFile(videoFiles)
  const pictures = Array.isArray(row.videoPicturesJson)
    ? (row.videoPicturesJson as PexelsVideoPicture[])
    : []
  const poster = row.imageUrl ?? pictures[0]?.picture ?? row.url
  const playbackUrl = row.ossUrl ?? bestVideo?.link ?? row.url

  return {
    fileUrl: playbackUrl,
    previewUrl: playbackUrl,
    thumbnailUrl: poster,
  }
}

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json();
  const scriptId =
    typeof body.scriptId === "string" ? body.scriptId.trim() : "";
  const scriptContentDraft =
    typeof body.scriptContentDraft === "string"
      ? body.scriptContentDraft.trim()
      : "";
  const structureId =
    typeof body.structureId === "string" ? body.structureId.trim() : "";
  const packagingTemplateId =
    typeof body.packagingTemplateId === "string"
      ? body.packagingTemplateId.trim()
      : "";
  const existingItems = Array.isArray(body.existingItems)
    ? (body.existingItems as MaterialAssignment[])
    : [];
  const requestedMaxCount =
    typeof body.maxCount === "number" && Number.isFinite(body.maxCount)
      ? Math.floor(body.maxCount)
      : null;

  if (!scriptId || !packagingTemplateId) {
    return NextResponse.json(
      { error: "scriptId and packagingTemplateId are required" },
      { status: 400 },
    );
  }

  const [script, packagingTemplate, structure] = await Promise.all([
    prisma.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        userId: true,
        content: true,
      },
    }),
    prisma.videoPackagingTemplate.findUnique({
      where: { id: packagingTemplateId },
      select: {
        id: true,
        name: true,
        capabilities: true,
      },
    }),
    structureId
      ? prisma.videoStructure.findFirst({
          where: {
            OR: [{ id: structureId }, { name: structureId }],
            status: "published",
          },
          select: { id: true, blueprint: true },
        })
      : Promise.resolve(null),
  ]);

  if (!script || script.userId !== user.id) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  if (!packagingTemplate) {
    return NextResponse.json(
      { error: "Packaging template not found" },
      { status: 404 },
    );
  }

  const effectiveScript = scriptContentDraft || script.content;
  if (!effectiveScript.trim()) {
    return NextResponse.json(
      { error: "scriptContentDraft or stored script content is required" },
      { status: 400 },
    );
  }

  const maxCount = clamp(
    requestedMaxCount ?? getSuggestedMaterialCount(effectiveScript),
    3,
    15,
  );
  const preferredRoles = structure
    ? buildStructurePackagingIntent(
        structure.blueprint as unknown as Parameters<typeof buildStructurePackagingIntent>[0],
      ).recommendedMaterialRoles.filter(
        (role): role is SafeRole => SAFE_AI_MATERIAL_ROLES.includes(role as SafeRole),
      )
    : undefined

  const storedIndustry = null;
  const effectiveOffer = null;
  const effectiveAudience = null;

  // LLM-based industry inference: use content signals (IP name, script, offer)
  // to determine the REAL industry, overriding potentially wrong stored value.
  const inferred = await inferIndustryFromContent({
    ipName: null,
    storedIndustry,
    primaryOffer: effectiveOffer,
    targetAudience: effectiveAudience,
    scriptExcerpt: effectiveScript,
  });

  const effectiveIndustry = inferred?.industry ?? storedIndustry;

  const searchPlan = await buildSearchPlan({
    existingItems,
    maxCount,
    packagingTemplateName: packagingTemplate.name,
    scriptContent: effectiveScript,
    ipProfileSnapshot: "",
    preferredRoles,
    industry: effectiveIndustry,
    primaryOffer: effectiveOffer,
    targetAudience: effectiveAudience,
  });

  const seenIds = new Set<string>();
  const suggestions: MaterialAssignment[] = [];

  // Use LLM-inferred archetype if available, otherwise fall back to regex
  const archetype = inferred?.archetype ?? resolveVisualArchetype(storedIndustry, effectiveOffer);
  const scoringContext = {
    industry: effectiveIndustry,
    primaryOffer: effectiveOffer,
    targetAudience: effectiveAudience,
    archetype,
  };

  for (const entry of searchPlan.queries) {
    const rows = await loadMediaFromAllProviders(
      entry.query,
      entry.mediaType,
      Math.max(4, entry.count * 3),
    );

    // Score all candidates (Tier 1 deterministic + Tier 2 LLM if needed)
    const scored = await scoreAndFilterMedia(rows, scoringContext, {
      role: entry.role,
      query: entry.query,
    });
    const accepted = scored.filter((s) => !s.rejected);

    let collected = 0;
    for (const { row } of accepted) {
      const uniqueKey = `${row.provider}:${row.pexelsId}`;
      if (seenIds.has(uniqueKey)) continue;
      seenIds.add(uniqueKey);

      const source: PackagingMaterialSource =
        row.provider === "pixabay" ? "ai_pixabay" : "ai_pexels";

      const urls =
        entry.mediaType === "video"
          ? getVideoPreviewUrls(row)
          : getPhotoPreviewUrls(row);
      suggestions.push({
        role: entry.role,
        type: entry.mediaType,
        fileUrl: urls.fileUrl,
        source,
        pexelsId: row.pexelsId,
        searchQuery: entry.query,
        thumbnailUrl: urls.thumbnailUrl,
        previewUrl: urls.previewUrl,
        ossStatus: row.ossStatus === "ready" ? "ready" : "pending",
        quality: "matched",
      });

      collected += 1;
      if (collected >= entry.count) break;
    }

    // Abstract fallback: fill remaining slots when scored candidates insufficient
    if (collected < entry.count) {
      const remaining = entry.count - collected;
      const { query: abstractQuery } = generateAbstractFallbackQueries(entry.role, archetype);
      const abstractRows = await loadMediaFromAllProviders(
        abstractQuery,
        entry.mediaType,
        Math.max(4, remaining * 2),
      );

      for (const row of abstractRows) {
        const uniqueKey = `${row.provider}:${row.pexelsId}`;
        if (seenIds.has(uniqueKey)) continue;
        seenIds.add(uniqueKey);

        const source: PackagingMaterialSource =
          row.provider === "pixabay" ? "ai_pixabay" : "ai_pexels";
        const urls =
          entry.mediaType === "video"
            ? getVideoPreviewUrls(row)
            : getPhotoPreviewUrls(row);
        suggestions.push({
          role: entry.role,
          type: entry.mediaType,
          fileUrl: urls.fileUrl,
          source,
          pexelsId: row.pexelsId,
          searchQuery: abstractQuery,
          thumbnailUrl: urls.thumbnailUrl,
          previewUrl: urls.previewUrl,
          ossStatus: row.ossStatus === "ready" ? "ready" : "pending",
          quality: "generic",
        });

        collected += 1;
        if (collected >= entry.count) break;
      }
    }
  }

  const estimatedDuration = Math.max(8, effectiveScript.length / 3.5);
  const targetMaterialDuration = estimatedDuration * 0.35;

  const signedSuggestions = suggestions.map((s) => ({
    ...s,
    fileUrl: generateSignedUrl(s.fileUrl),
    previewUrl: s.previewUrl ? generateSignedUrl(s.previewUrl) : s.previewUrl,
    thumbnailUrl: s.thumbnailUrl,
  }));

  // Fire-and-forget: transfer pending media to OSS asynchronously.
  // The frontend polls for ossStatus updates; production-plan submission
  // still gates on ossStatus === "ready" via isMaterialReadyForProduction().
  const pendingTransfers = suggestions
    .filter((s) => s.ossStatus === "pending" && s.pexelsId)
    .map((s) => s.pexelsId!);

  if (pendingTransfers.length > 0) {
    // Lookup full media rows for pending items to get srcJson/videoFilesJson
    prisma.pexelsMedia
      .findMany({
        where: {
          pexelsId: { in: pendingTransfers },
        },
        select: {
          id: true,
          pexelsId: true,
          mediaType: true,
          ossStatus: true,
          srcJson: true,
          videoFilesJson: true,
          provider: true,
        },
      })
      .then((mediaRows) => {
        const transfers = mediaRows
          .filter((m) => m.ossStatus === "pending")
          .map((m) =>
            transferPexelsMediaToOss({
              id: m.id,
              pexelsId: m.pexelsId,
              mediaType: m.mediaType,
              ossStatus: m.ossStatus,
              srcJson: m.srcJson,
              videoFilesJson: m.videoFilesJson,
              provider: m.provider,
            })
          );
        return Promise.allSettled(transfers);
      })
      .then((results) => {
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          console.warn(
            `[packaging-material-suggestions] ${failed.length}/${results.length} async OSS transfers failed`
          );
        }
      })
      .catch((error) => {
        console.error(
          "[packaging-material-suggestions] async OSS transfer batch failed:",
          error
        );
      });
  }

  // Determine planSource: "abstract_fallback" only when majority of suggestions are generic
  const genericCount = suggestions.filter((s) => s.quality === "generic").length;
  const effectivePlanSource: "llm" | "deterministic" | "abstract_fallback" =
    genericCount > suggestions.length / 2
      ? "abstract_fallback"
      : searchPlan.source;

  return NextResponse.json({
    data: {
      suggestions: signedSuggestions,
      meta: {
        scriptEstimatedDuration: Math.round(estimatedDuration),
        targetMaterialDuration: Math.round(targetMaterialDuration),
        totalSuggested: signedSuggestions.length,
        planSource: effectivePlanSource,
      },
    },
  });
});
