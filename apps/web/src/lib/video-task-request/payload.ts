import { AssetReadabilityError, resolveBackgroundMusicForUpstream, resolveMaterialAssignmentsForUpstream } from "@/lib/upstream-media";
import type { MaterialAssignment } from "@/types/api";
import type { MaterialItem, PackRules, ProcessRules, SpeakerExtra } from "@/types/shanjian";
import { VALID_VIDEO_TASK_TYPES, type CreateVideoTaskInput, type ResolvedAvatar, type ResolvedPlan, type VideoTaskType, VideoTaskRequestError } from "./contracts";

export function resolveVideoTaskType(plan: ResolvedPlan | null, requestedType?: string): VideoTaskType {
  const type = plan?.videoType ?? requestedType;
  if (!type || !isVideoTaskType(type)) {
    throw new VideoTaskRequestError(`Invalid type. Must be one of: ${VALID_VIDEO_TASK_TYPES.join(", ")}`, 400);
  }
  return plan && hasSceneSegmentMaterials(plan.materials) && type === "virtualman_broadcast"
    ? "custom_virtualman_broadcast"
    : type;
}

export function buildShanjianSubmitPayload(input: {
  body: CreateVideoTaskInput;
  plan: ResolvedPlan | null;
  videoType: VideoTaskType;
  avatar: ResolvedAvatar | null;
  scriptContent: string;
}): Record<string, unknown> {
  const { body, plan, videoType, avatar, scriptContent } = input;
  const { type, avatarId, scriptId, scriptContent: _, sourceTemplateId, styleId, productionPlanId, ...rest } = body;
  const resolved = resolveUpstreamPackaging(plan);
  const planMaterials = resolved.materials ? toMaterialItems(resolved.materials) : undefined;
  const planPackRules = plan ? mergePackRules(plan.packRules, resolved.backgroundMusic ?? null) : undefined;
  const processRules = plan
    ? (plan.processRules as ProcessRules | null) ?? undefined
    : (rest.processRules as ProcessRules | null | undefined) ?? undefined;
  const speakerExtra: SpeakerExtra = { ...(rest.speakerExtra as SpeakerExtra | undefined) };

  return {
    videoType,
    styleId: plan?.styleId ?? styleId,
    ...rest,
    content: scriptContent,
    text: scriptContent,
    virtualmanId: avatar?.externalVirtualmanId ?? null,
    speakerId: avatar?.externalSpeakerId ?? null,
    speakerExtra,
    processRules,
    ...(planMaterials ? { materials: planMaterials } : {}),
    ...(planPackRules ? { packRules: planPackRules } : {}),
    ...(videoType === "custom_virtualman_broadcast" && plan
      ? { scenes: [{ captions: { content: scriptContent }, materials: planMaterials || [] }] }
      : {}),
  };
}

function isVideoTaskType(value: string): value is VideoTaskType {
  return (VALID_VIDEO_TASK_TYPES as readonly string[]).includes(value);
}

function hasSceneSegmentMaterials(materials: MaterialAssignment[] | null): boolean {
  return Boolean(materials?.some((material) => /^(scene|segment)_/i.test(material.role)));
}

function toMaterialItems(materials: MaterialAssignment[]): MaterialItem[] {
  return materials.map((material) => ({ type: material.type, fileUrl: material.fileUrl }));
}

function mergePackRules(
  packRules: Record<string, unknown> | null,
  backgroundMusic: { audioUrl: string; volume: number } | null,
): PackRules | undefined {
  if (!packRules && !backgroundMusic) return undefined;
  const merged: PackRules = { ...(packRules as PackRules) };
  if (backgroundMusic) merged.backgroundMusic = { audioSwitch: true, audioUrl: backgroundMusic.audioUrl, volume: backgroundMusic.volume };
  return merged;
}

function resolveUpstreamPackaging(plan: ResolvedPlan | null): {
  materials: MaterialAssignment[] | undefined;
  backgroundMusic: { audioUrl: string; volume: number } | undefined;
} {
  if (!plan) return { materials: undefined, backgroundMusic: undefined };
  try {
    return {
      materials: resolveMaterialAssignmentsForUpstream(plan.materials),
      backgroundMusic: resolveBackgroundMusicForUpstream(plan.backgroundMusic),
    };
  } catch (error) {
    if (error instanceof AssetReadabilityError) {
      throw new VideoTaskRequestError(error.message, 422, { code: error.code, field: error.field });
    }
    throw error;
  }
}
