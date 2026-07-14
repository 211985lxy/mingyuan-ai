import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { generateSignedUrl } from "@/lib/oss"
import { transferPexelsMediaToOss } from "@/lib/pexels-oss"
import { getSuggestedMaterialCount, SAFE_AI_MATERIAL_ROLES } from "@/lib/packaging-materials"
import { buildStructurePackagingIntent } from "@/lib/video-template-config"
import type { MaterialAssignment } from "@/types/api"
import { clamp, buildSearchPlan, inferIndustryFromContent, resolveVisualArchetype } from "@/lib/packaging-material-suggestions/material-plan"
import { type SafeRole } from "@/lib/packaging-material-suggestions/contracts"
import { collectMaterialSuggestions } from "@/lib/packaging-material-suggestions/suggestion-collector"

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
    prisma.script.findFirst({
      where: { id: scriptId, userId: user.id },
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

  if (!script) {
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

  const archetype = inferred?.archetype ?? resolveVisualArchetype(storedIndustry, effectiveOffer);
  const scoringContext = {
    industry: effectiveIndustry,
    primaryOffer: effectiveOffer,
    targetAudience: effectiveAudience,
    archetype,
  };
  const suggestions = await collectMaterialSuggestions({
    searchPlan,
    archetype,
    scoringContext,
  });

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
