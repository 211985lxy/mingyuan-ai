import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import { signOssUrls } from "@/lib/oss";

const VALID_ASSET_TYPES = ["image", "video", "music"];

// ─── POST /api/assets ──────────────────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const { name, assetType, url, size } = await parseJsonRecord(request);

  if (!name || !assetType || !url) {
    return NextResponse.json(
      { error: "name, assetType, and url are required" },
      { status: 400 },
    );
  }

  if (!VALID_ASSET_TYPES.includes(assetType)) {
    return NextResponse.json(
      { error: `assetType must be one of: ${VALID_ASSET_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const asset = await prisma.asset.create({
    data: {
      userId: user.id,
      name,
      assetType,
      url,
      size: size ?? null,
    },
  });

  return NextResponse.json({ data: asset }, { status: 201 });
});

// ─── GET /api/assets ───────────────────────────────────

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get("assetType");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const where: { userId: string; assetType?: string } = { userId: user.id };
  if (assetType) where.assetType = assetType;

  const [results, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  return NextResponse.json({ data: { results: signOssUrls(results), total, page, pageSize } });
});
