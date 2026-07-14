import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server";
import { signOssUrls } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import { cloneVoice, getPublicVoices } from "@/lib/shanjian";
import { ensureUserAvatarVoiceAssets } from "@/lib/avatar-voice-assets";
import {
  AssetReadabilityError,
  resolveUpstreamReadableUrl,
} from "@/lib/upstream-media";

const VALID_MODELS = ["v1", "v2", "v3", "s1", "s3"];

// ─── POST /api/voices ──────────────────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const { name, audioUrl, model, language } = await parseJsonRecord(request);

  if (!name || !audioUrl || !model) {
    return NextResponse.json(
      { error: "name, audioUrl, and model are required" },
      { status: 400 },
    );
  }

  if (!VALID_MODELS.includes(model)) {
    return NextResponse.json(
      { error: `model must be one of: ${VALID_MODELS.join(", ")}` },
      { status: 400 },
    );
  }

  // Create Asset record
  const asset = await prisma.asset.create({
    data: {
      userId: user.id,
      name,
      assetType: "voice",
      url: audioUrl,
      status: "processing",
      voiceModel: model,
    },
  });

  try {
    const taskId = await cloneVoice({
      audioUrl: resolveUpstreamReadableUrl(audioUrl, "audioUrl"),
      model,
      language,
    });

    const updatedAsset = await prisma.asset.update({
      where: { id: asset.id },
      data: { externalTaskId: taskId },
    });

    return NextResponse.json({ data: updatedAsset }, { status: 201 });
  } catch (error) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Voice clone failed",
      },
    });

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
});

// ─── GET /api/voices ───────────────────────────────────

export const GET = withUserAuth(async (_request, { user }) => {
  await ensureUserAvatarVoiceAssets(user.id);

  const [userVoices, publicVoices] = await Promise.all([
    prisma.asset.findMany({
      where: { userId: user.id, assetType: "voice" },
      orderBy: { createdAt: "desc" },
    }),
    getPublicVoices(),
  ]);

  return NextResponse.json({ data: { userVoices: signOssUrls(userVoices), publicVoices } });
});
