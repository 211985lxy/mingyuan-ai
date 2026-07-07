import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import { checkConcurrencyLimit } from "@/lib/rate-limit";
import { generateVideoThumbnailUrl, isManagedOssUrl, signOssUrls } from "@/lib/oss";
import {
  normalizePackagingInputs,
  PackagingInputError,
} from "@/lib/packaging-assets";
import {
  AssetReadabilityError,
  resolveBackgroundMusicForUpstream,
  resolveMaterialAssignmentsForUpstream,
} from "@/lib/upstream-media";
import {
  buildReservedVideoTaskDefaults,
  compensateVideoTaskSubmissionFailure,
  finalizeAcceptedVideoTaskSubmission,
} from "@/lib/video-task-settlement";
import { ShanjianError } from "@/lib/shanjian";
import { acquireSlot } from "@/lib/shanjian-semaphore";
import { submitToShanjian } from "@/lib/shanjian-submit";
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits";
import type { MaterialItem, PackRules, ProcessRules, SpeakerExtra } from "@/types/shanjian";
import type { MaterialAssignment } from "@/types/api";
import { Prisma } from "@/generated/prisma/client";

// ─── Valid video task types ─────────────────────────────

const VALID_TYPES = [
  "virtualman_broadcast",
  "realman_broadcast",
  "broadcast_mixcut",
  "news_mixcut",
  "virtualman_video",
  "custom_virtualman_broadcast",
  "custom_realman_broadcast",
  "custom_broadcast_mixcut",
  "ai_cover",
] as const;

type VideoTaskType = (typeof VALID_TYPES)[number];

const AVATAR_REQUIRING_TYPES: VideoTaskType[] = [
  "virtualman_broadcast",
  "virtualman_video",
  "custom_virtualman_broadcast",
];

// ─── Production plan types ──────────────────────────────

interface ResolvedPlan {
  id: string;
  scriptId: string;
  structureId: string | null;
  packagingTemplateId: string | null;
  styleId: string;
  materials: MaterialAssignment[] | null;
  backgroundMusic: { audioUrl: string; volume: number } | null;
  packRules: Record<string, unknown> | null;
  processRules: Record<string, unknown> | null;
  recommendationContext: Record<string, unknown> | null;
  videoType: string;
  structureSnapshot: Record<string, unknown> | null;
  packagingSnapshot: Record<string, unknown> | null;
}

/** Check if materials contain explicit scene-by-scene entries. */
function hasSceneSegmentMaterials(
  materials: MaterialAssignment[] | null,
): boolean {
  if (!materials || materials.length === 0) return false;
  // Generic evidence roles such as product_detail or customer_case should stay
  // on the standard template-level material path. Only explicit scene/segment
  // markers should force the custom endpoint.
  return materials.some((m) => /^(scene|segment)_/i.test(m.role));
}

/** Convert plan materials to Shanjian MaterialItem format. */
function toMaterialItems(materials: MaterialAssignment[]): MaterialItem[] {
  return materials.map((m) => ({
    type: m.type,
    fileUrl: m.fileUrl,
  }));
}

/** Merge backgroundMusic into packRules. */
function mergePackRules(
  packRules: Record<string, unknown> | null,
  backgroundMusic: { audioUrl: string; volume: number } | null,
): PackRules | undefined {
  if (!packRules && !backgroundMusic) return undefined;
  const merged: PackRules = { ...(packRules as PackRules) };
  if (backgroundMusic) {
    merged.backgroundMusic = {
      audioSwitch: true,
      audioUrl: backgroundMusic.audioUrl,
      volume: backgroundMusic.volume,
    };
  }
  return merged;
}

async function resolveAvatarSpeakerId(input: {
  avatarId: string;
  userId: string;
  speakerId: string | null;
  speakerName?: string | null;
}): Promise<string | null> {
  if (input.speakerId) {
    return input.speakerId;
  }

  const linkedVoice = await prisma.asset.findFirst({
    where: {
      userId: input.userId,
      assetType: "voice",
      status: "ready",
      externalSpeakerId: { not: null },
      OR: [
        { sourceAvatarId: input.avatarId },
        ...(input.speakerName ? [{ name: input.speakerName }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      externalSpeakerId: true,
      name: true,
    },
  });

  if (!linkedVoice?.externalSpeakerId) {
    return null;
  }

  await prisma.avatar.update({
    where: { id: input.avatarId },
    data: {
      externalSpeakerId: linkedVoice.externalSpeakerId,
      speakerName: input.speakerName || linkedVoice.name,
    },
  });

  return linkedVoice.externalSpeakerId;
}

class TaskReservationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaskReservationError";
  }
}

// ─── POST /api/tasks ────────────────────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json();
  const {
    type,
    avatarId,
    scriptId,
    scriptContent,
    sourceTemplateId,
    styleId,
    productionPlanId,
    ...rest
  } = body;

  const videoLimitResponse = await enforceDailyBetaLimit(user.id, "video_task");
  if (videoLimitResponse) return videoLimitResponse;

  // ─── Load production plan if provided ───────────────────
  let plan: ResolvedPlan | null = null;

  if (productionPlanId) {
    const dbPlan = await prisma.videoProductionPlan.findUnique({
      where: { id: productionPlanId },
      include: {
        structure: {
          select: { id: true, name: true, displayName: true, blueprint: true },
        },
        packagingTemplate: {
          select: {
            id: true,
            shanjianId: true,
            name: true,
            scene: true,
            capabilities: true,
          },
        },
      },
    });

    if (!dbPlan || dbPlan.userId !== user.id) {
      return NextResponse.json(
        { error: "Production plan not found" },
        { status: 404 },
      );
    }

    if (dbPlan.status !== "draft") {
      return NextResponse.json(
        { error: "Production plan has already been used or reserved" },
        { status: 422 },
      );
    }

    plan = {
      id: dbPlan.id,
      scriptId: dbPlan.scriptId,
      structureId: dbPlan.structureId,
      packagingTemplateId: dbPlan.packagingTemplateId,
      styleId: dbPlan.styleId,
      materials: dbPlan.materials as MaterialAssignment[] | null,
      backgroundMusic: dbPlan.backgroundMusic as { audioUrl: string; volume: number } | null,
      packRules: dbPlan.packRules as Record<string, unknown> | null,
      processRules: dbPlan.processRules as Record<string, unknown> | null,
      recommendationContext:
        dbPlan.recommendationContext as Record<string, unknown> | null,
      videoType: dbPlan.videoType,
      structureSnapshot: dbPlan.structure
        ? {
            id: dbPlan.structure.id,
            name: dbPlan.structure.name,
            displayName: dbPlan.structure.displayName,
            blueprint: dbPlan.structure.blueprint,
          }
        : null,
      packagingSnapshot: dbPlan.packagingTemplate
        ? {
            id: dbPlan.packagingTemplate.id,
            shanjianId: dbPlan.packagingTemplate.shanjianId,
            name: dbPlan.packagingTemplate.name,
            scene: dbPlan.packagingTemplate.scene,
            capabilities: dbPlan.packagingTemplate.capabilities,
            recommendationContext: dbPlan.recommendationContext,
          }
        : null,
    };

    try {
      const normalized = await normalizePackagingInputs({
        userId: user.id,
        materials: plan.materials,
        backgroundMusic: plan.backgroundMusic,
      });
      plan = {
        ...plan,
        materials: normalized.materials,
        backgroundMusic: normalized.backgroundMusic,
      };
    } catch (error) {
      if (error instanceof PackagingInputError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            field: error.field ?? null,
          },
          { status: error.status },
        );
      }
      throw error;
    }
  }

  // Resolve styleId: plan takes priority over body-level styleId
  const resolvedStyleId = plan?.styleId ?? styleId;

  // Validate type — plan.videoType takes priority if explicitly set
  const requestedType = plan?.videoType ?? type;
  if (!requestedType || !VALID_TYPES.includes(requestedType)) {
    return NextResponse.json(
      {
        error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Determine effective video type: route to custom_virtualman_broadcast when
  // a plan is used with scene-segment materials
  let videoType = requestedType as VideoTaskType;
  if (plan) {
    if (
      hasSceneSegmentMaterials(plan.materials) &&
      videoType === "virtualman_broadcast"
    ) {
      videoType = "custom_virtualman_broadcast";
    }
  }

  // For avatar-requiring types, resolve the avatar (DB or public Shanjian)
  let avatar: {
    id: string;
    name: string;
    userId: string;
    status: string;
    externalVirtualmanId: string | null;
    externalSpeakerId: string | null;
    speakerName: string | null;
  } | null = null;

  // Public avatar support: virtualmanId + speakerId passed directly
  const isPublicAvatar = !!(body.virtualmanId && body.speakerId);

  if (AVATAR_REQUIRING_TYPES.includes(videoType)) {
    if (isPublicAvatar) {
      // Using a public Shanjian avatar directly
      avatar = {
        id: "public",
        name: body.avatarName || "公共数字人",
        userId: user.id,
        status: "ready",
        externalVirtualmanId: body.virtualmanId,
        externalSpeakerId: body.speakerId,
        speakerName: body.avatarName || "公共数字人",
      };
    } else {
      if (!avatarId) {
        return NextResponse.json(
          { error: "avatarId or (virtualmanId + speakerId) is required" },
          { status: 400 },
        );
      }

      avatar = await prisma.avatar.findUnique({
        where: { id: avatarId },
        select: {
          id: true,
          name: true,
          userId: true,
          status: true,
          externalVirtualmanId: true,
          externalSpeakerId: true,
          speakerName: true,
        },
      });

      if (!avatar || avatar.userId !== user.id) {
        return NextResponse.json(
          { error: "Avatar not found" },
          { status: 404 },
        );
      }

      if (avatar.status !== "ready") {
        return NextResponse.json(
          { error: "Avatar is not ready" },
          { status: 422 },
        );
      }

      if (!avatar.externalVirtualmanId) {
        return NextResponse.json(
          { error: "Avatar clone did not produce required IDs" },
          { status: 422 },
        );
      }

      avatar.externalSpeakerId = await resolveAvatarSpeakerId({
        avatarId: avatar.id,
        userId: user.id,
        speakerId: avatar.externalSpeakerId,
        speakerName: avatar.speakerName,
      });

      if (!avatar.externalSpeakerId) {
        return NextResponse.json(
          { error: "该数字人的专属声音还在克隆中，请稍后再试或更换数字人" },
          { status: 422 },
        );
      }
    }
  }

  let existingScript: {
    id: string;
    userId: string;
    content: string;
    sourceTemplateId: string | null;
  } | null = null;

  // Resolve script: plan.scriptId takes priority, then body.scriptId
  const resolvedScriptId_input = plan?.scriptId ?? scriptId;

  if (resolvedScriptId_input) {
    existingScript = await prisma.script.findUnique({
      where: { id: resolvedScriptId_input },
      select: {
        id: true,
        userId: true,
        content: true,
        sourceTemplateId: true,
      },
    });

    if (!existingScript || existingScript.userId !== user.id) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }
  }

  const resolvedScriptContent = existingScript?.content ?? scriptContent ?? "";

  if (
    ["virtualman_broadcast", "broadcast_mixcut", "virtualman_video"].includes(
      videoType,
    ) &&
    !resolvedScriptContent.trim()
  ) {
    return NextResponse.json(
      { error: "scriptId or scriptContent is required for this video type" },
      { status: 400 },
    );
  }

  let resolvedPlanMaterials: MaterialAssignment[] | undefined;

  let resolvedPlanBackgroundMusic:
    | {
        audioUrl: string;
        volume: number;
      }
    | undefined;

  try {
    resolvedPlanMaterials = plan
      ? resolveMaterialAssignmentsForUpstream(plan.materials)
      : undefined;
    resolvedPlanBackgroundMusic = plan
      ? resolveBackgroundMusicForUpstream(plan.backgroundMusic)
      : undefined;
  } catch (error) {
    if (error instanceof AssetReadabilityError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          field: error.field,
        },
        { status: 422 },
      );
    }
    throw error;
  }

  // Pre-compute plan-derived Shanjian parameters
  const planPackRules = plan
    ? mergePackRules(plan.packRules, resolvedPlanBackgroundMusic ?? null)
    : undefined;
  const effectiveProcessRules = plan
    ? ((plan.processRules as ProcessRules | null) ?? undefined)
    : ((rest.processRules as ProcessRules | null | undefined) ?? undefined);
  // Merge request speakerExtra; do NOT inject a default speedRatio — some
  // Shanjian templates reject unknown or unsupported speakerExtra fields,
  // and the caller is responsible for passing speedRatio when needed.
  const effectiveSpeakerExtra: SpeakerExtra = {
    ...(rest.speakerExtra as SpeakerExtra | undefined),
  };
  const planMaterials = resolvedPlanMaterials
    ? toMaterialItems(resolvedPlanMaterials)
    : undefined;

  // Build the complete Shanjian submit payload BEFORE the transaction so it
  // can be persisted with the task (enabling worker re-submission of queued tasks).
  const shanjianSubmitPayload: Record<string, unknown> = {
    videoType,
    styleId: resolvedStyleId,
    // Explicit values override rest; plan-built scenes come last and win
    ...rest,
    content: resolvedScriptContent,
    text: resolvedScriptContent, // virtualman_video uses `text` not `content`
    virtualmanId: avatar?.externalVirtualmanId ?? null,
    speakerId: avatar?.externalSpeakerId ?? null,
    speakerExtra: effectiveSpeakerExtra,
    processRules: effectiveProcessRules,
    ...(planMaterials ? { materials: planMaterials } : {}),
    ...(planPackRules ? { packRules: planPackRules } : {}),
    // For custom_virtualman_broadcast + plan: build scenes from resolved data
    ...(videoType === "custom_virtualman_broadcast" && plan
      ? { scenes: [{ captions: { content: resolvedScriptContent }, materials: planMaterials || [] }] }
      : {}),
  };

  let reservation: {
    taskId: string;
    resolvedSourceTemplateId: string | null;
  } | null = null;
  let upstreamAccepted = false;
  let externalTaskId: string | null = null;
  let shanjianPayload: Record<string, unknown> | null = null;

  try {
    // ─── Transaction: create task as queued, persist full payload ───────
    reservation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${user.id} FOR UPDATE`;

      const dbUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { plan: true },
      });

      const concurrency = await checkConcurrencyLimit(
        user.id,
        dbUser?.plan ?? "free",
        { videoTask: tx.videoTask },
      );

      if (!concurrency.allowed) {
        throw new TaskReservationError(
          `您当前有 ${concurrency.current} 个视频正在生成中，最多同时生成 ${concurrency.limit} 个。请等待当前任务完成后再试。`,
          429,
        );
      }

      if (plan) {
        const reservedPlan = await tx.videoProductionPlan.updateMany({
          where: {
            id: plan.id,
            userId: user.id,
            status: "draft",
          },
          data: {
            status: "confirmed",
          },
        });

        if (reservedPlan.count === 0) {
          throw new TaskReservationError(
            "Production plan has already been used or reserved",
            422,
          );
        }
      }

      let resolvedScriptId: string | undefined;
      let resolvedSourceTemplateId: string | null =
        existingScript?.sourceTemplateId ?? null;

      if (existingScript) {
        resolvedScriptId = existingScript.id;
      } else if (resolvedScriptContent) {
        const script = await tx.script.create({
          data: {
            userId: user.id,
            content: resolvedScriptContent,
            sourceTemplateId: sourceTemplateId ?? null,
          },
        });
        resolvedScriptId = script.id;
        resolvedSourceTemplateId = sourceTemplateId ?? null;
      }

      const videoTask = await tx.videoTask.create({
        data: {
          userId: user.id,
          avatarId: avatar?.id === "public" ? null : (avatar?.id ?? null),
          scriptId: resolvedScriptId ?? null,
          productionPlanId: plan?.id ?? null,
          structureId: plan?.structureId ?? null,
          packagingTemplateId: plan?.packagingTemplateId ?? null,
          structureSnapshot:
            (plan?.structureSnapshot as Prisma.InputJsonValue) ?? undefined,
          packagingSnapshot:
            (plan?.packagingSnapshot as Prisma.InputJsonValue) ?? undefined,
          status: "queued",  // Always start as queued; promoted to pending if slot acquired
          videoType: videoType,
          scriptContent: resolvedScriptContent,
          avatarName: avatar?.name ?? rest.avatarName ?? "",
          shanjianPayload: shanjianSubmitPayload as Prisma.InputJsonValue,
          ...buildReservedVideoTaskDefaults(),
        },
      });

      return {
        taskId: videoTask.id,
        resolvedSourceTemplateId,
      };
    });

    // ─── Fast path: try to acquire a Shanjian slot immediately ──────────
    const slotAcquired = await acquireSlot();

    if (!slotAcquired) {
      // No slot available — task stays queued, worker will pick it up
      const queuedTask = await prisma.videoTask.findUnique({
        where: { id: reservation.taskId },
      });
      return NextResponse.json(
        {
          data: {
            ...queuedTask,
            sourceTemplateId: reservation.resolvedSourceTemplateId,
          },
        },
        { status: 202 },
      );
    }

    // Slot acquired — promote to pending and submit immediately
    await prisma.videoTask.update({
      where: { id: reservation.taskId },
      data: { status: "pending" },
    });

    try {
      const result = await submitToShanjian(videoType, shanjianSubmitPayload);
      upstreamAccepted = true;
      externalTaskId = result.taskId;
      shanjianPayload = result.payload;
    } catch (submitError) {
      // Submission failed after acquiring a slot — compensate (which will releaseSlot)
      await compensateVideoTaskSubmissionFailure({
        taskId: reservation.taskId,
        errorCode:
          submitError instanceof ShanjianError ? submitError.code : undefined,
        errorMessage:
          submitError instanceof Error
            ? submitError.message
            : "Failed to create video task",
      });

      if (submitError instanceof ShanjianError) {
        return NextResponse.json(
          {
            error: submitError.message,
            code: submitError.code,
            requestId: submitError.requestId ?? null,
          },
          { status: 502 },
        );
      }

      return NextResponse.json(
        {
          error:
            submitError instanceof Error
              ? submitError.message
              : "Failed to create video task",
        },
        { status: 500 },
      );
    }

    const videoTask = await finalizeAcceptedVideoTaskSubmission({
      taskId: reservation.taskId,
      externalTaskId: externalTaskId!,
      productionPlanId: plan?.id ?? null,
      shanjianPayload,
    });

    if (!videoTask) {
      throw new Error("Submitted task could not be reloaded");
    }

    return NextResponse.json(
      {
        data: {
          ...videoTask,
          sourceTemplateId: reservation.resolvedSourceTemplateId,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AssetReadabilityError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          field: error.field,
        },
        { status: 422 },
      );
    }

    if (error instanceof TaskReservationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (
      error instanceof Error
      && error.message === "Task reservation is no longer active"
    ) {
      return NextResponse.json(
        { error: "Task reservation is no longer active" },
        { status: 409 },
      );
    }

    if (reservation?.taskId && upstreamAccepted && externalTaskId) {
      try {
        const recoveredTask = await finalizeAcceptedVideoTaskSubmission({
          taskId: reservation.taskId,
          externalTaskId,
          productionPlanId: plan?.id ?? null,
          shanjianPayload,
        });

        if (recoveredTask) {
          return NextResponse.json(
            {
              data: {
                ...recoveredTask,
                sourceTemplateId: reservation.resolvedSourceTemplateId,
              },
            },
            { status: 201 },
          );
        }
      } catch (recoveryError) {
        console.error(
          "[tasks] Failed to reconcile accepted upstream task",
          recoveryError,
        );
      }
    }

    if (reservation?.taskId && !upstreamAccepted) {
      await compensateVideoTaskSubmissionFailure({
        taskId: reservation.taskId,
        errorCode:
          error instanceof ShanjianError ? error.code : undefined,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to create video task",
      });
    }

    if (error instanceof ShanjianError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          requestId: error.requestId ?? null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create video task",
      },
      { status: 500 },
    );
  }
});

// ─── GET /api/tasks ─────────────────────────────────────

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const where: { userId: string; status?: string } = { userId: user.id };
  if (status) where.status = status;

  const [results, total] = await Promise.all([
    prisma.videoTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.videoTask.count({ where }),
  ]);

  const signedResults = results.map((t) => {
    const coverUrl = !t.coverUrl && t.videoUrl && isManagedOssUrl(t.videoUrl)
      ? generateVideoThumbnailUrl(t.videoUrl)
      : t.coverUrl;
    return signOssUrls({ ...t, coverUrl });
  });

  return NextResponse.json({ data: { results: signedResults, total, page, pageSize } });
});
