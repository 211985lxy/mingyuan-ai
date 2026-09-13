import { normalizePackagingInputs, PackagingInputError } from "@/lib/packaging-assets";
import { prisma } from "@/lib/prisma";
import type { MaterialAssignment } from "@/types/api";
import { type ResolvedPlan, VideoTaskRequestError } from "./contracts";

export async function resolveProductionPlan(
  userId: string,
  productionPlanId?: string,
): Promise<ResolvedPlan | null> {
  if (!productionPlanId) return null;

  const dbPlan = await loadProductionPlan(productionPlanId);
  if (!dbPlan || dbPlan.userId !== userId) {
    throw new VideoTaskRequestError("Production plan not found", 404);
  }
  if (dbPlan.status !== "draft") {
    throw new VideoTaskRequestError("Production plan has already been used or reserved", 422);
  }

  const plan = toResolvedPlan(dbPlan);
  return normalizePlanInputs(userId, plan);
}

async function loadProductionPlan(productionPlanId: string) {
  return prisma.videoProductionPlan.findUnique({
    where: { id: productionPlanId },
    include: {
      structure: { select: { id: true, name: true, displayName: true, blueprint: true } },
      packagingTemplate: { select: { id: true, shanjianId: true, name: true, scene: true, capabilities: true } },
    },
  });
}

function toResolvedPlan(
  dbPlan: NonNullable<Awaited<ReturnType<typeof loadProductionPlan>>>,
): ResolvedPlan {
  return {
    id: dbPlan.id,
    scriptId: dbPlan.scriptId,
    structureId: dbPlan.structureId,
    packagingTemplateId: dbPlan.packagingTemplateId,
    styleId: dbPlan.styleId,
    materials: dbPlan.materials as MaterialAssignment[] | null,
    backgroundMusic: dbPlan.backgroundMusic as { audioUrl: string; volume: number } | null,
    packRules: dbPlan.packRules as Record<string, unknown> | null,
    processRules: dbPlan.processRules as Record<string, unknown> | null,
    recommendationContext: dbPlan.recommendationContext as Record<string, unknown> | null,
    videoType: dbPlan.videoType,
    structureSnapshot: dbPlan.structure ? {
      id: dbPlan.structure.id,
      name: dbPlan.structure.name,
      displayName: dbPlan.structure.displayName,
      blueprint: dbPlan.structure.blueprint,
    } : null,
    packagingSnapshot: dbPlan.packagingTemplate ? {
      id: dbPlan.packagingTemplate.id,
      shanjianId: dbPlan.packagingTemplate.shanjianId,
      name: dbPlan.packagingTemplate.name,
      scene: dbPlan.packagingTemplate.scene,
      capabilities: dbPlan.packagingTemplate.capabilities,
      recommendationContext: dbPlan.recommendationContext as Record<string, unknown> | null,
    } : null,
  };
}

async function normalizePlanInputs(userId: string, plan: ResolvedPlan): Promise<ResolvedPlan> {
  try {
    const normalized = await normalizePackagingInputs({
      userId,
      materials: plan.materials,
      backgroundMusic: plan.backgroundMusic,
    });
    return { ...plan, materials: normalized.materials, backgroundMusic: normalized.backgroundMusic };
  } catch (error) {
    if (error instanceof PackagingInputError) {
      throw new VideoTaskRequestError(error.message, error.status, { code: error.code, field: error.field ?? null });
    }
    throw error;
  }
}
