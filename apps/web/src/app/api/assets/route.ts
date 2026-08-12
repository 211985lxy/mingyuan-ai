import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import {
  assertCompletedReservationForManagedUrl,
  isManagedOssUrl,
  signOssUrls,
  UploadReservationError,
} from "@/lib/oss";

const VALID_ASSET_TYPES = ["image", "video", "music", "document"];

// ─── POST /api/assets ──────────────────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const { name, assetType, url, size, uploadId } = await parseJsonRecord(request);

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

  // 托管桶 URL 禁止浏览器随意登记；必须对应已完成的上传预约
  if (typeof url === "string" && isManagedOssUrl(url)) {
    try {
      await assertCompletedReservationForManagedUrl({
        userId: user.id,
        assetUrl: url,
        uploadId: typeof uploadId === "string" ? uploadId : null,
      });
    } catch (error) {
      if (error instanceof UploadReservationError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      throw error;
    }
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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));

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
