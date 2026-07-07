import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import { deleteAsset } from "@/lib/shanjian";
import { signOssUrls } from "@/lib/oss";

// ─── GET /api/avatars/[id] ─────────────────────────────

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const avatar = await prisma.avatar.findUnique({ where: { id } });

  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (avatar.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: signOssUrls(avatar) });
});

// ─── DELETE /api/avatars/[id] ──────────────────────────

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const avatar = await prisma.avatar.findUnique({ where: { id } });

  if (!avatar) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (avatar.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check for active video tasks referencing this avatar
  const activeTasks = await prisma.videoTask.count({
    where: { avatarId: id, status: { in: ["pending", "processing"] } },
  });
  if (activeTasks > 0) {
    return NextResponse.json(
      { error: "Cannot delete avatar with active video tasks" },
      { status: 409 },
    );
  }

  // Fire-and-forget: delete external assets
  if (avatar.externalVirtualmanId) {
    deleteAsset(avatar.externalVirtualmanId).catch(() => {});
  }

  await prisma.avatar.delete({ where: { id } });

  return NextResponse.json({ data: { deleted: true } });
});
