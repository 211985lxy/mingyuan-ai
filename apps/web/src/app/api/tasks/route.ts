import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server";
import { generateVideoThumbnailUrl, isManagedOssUrl, signOssUrls } from "@/lib/oss";
import { prisma } from "@/lib/prisma";
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits";
import { createVideoTask } from "@/lib/video-task-request/service";
import { type CreateVideoTaskInput, VideoTaskRequestError } from "@/lib/video-task-request/contracts";
import { withUserAuth } from "@/lib/user-auth";

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request) as CreateVideoTaskInput;
  const limitResponse = await enforceDailyBetaLimit(user.id, "video_task");
  if (limitResponse) return limitResponse;

  try {
    const result = await createVideoTask(user.id, body);
    return NextResponse.json({ data: result.data }, { status: result.status });
  } catch (error) {
    return taskErrorResponse(error);
  }
});

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") ?? "20", 10);
  const where: { userId: string; status?: string } = { userId: user.id };
  if (status) where.status = status;

  const [results, total] = await Promise.all([
    prisma.videoTask.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.videoTask.count({ where }),
  ]);
  const signedResults = results.map((task) => {
    const coverUrl = !task.coverUrl && task.videoUrl && isManagedOssUrl(task.videoUrl)
      ? generateVideoThumbnailUrl(task.videoUrl)
      : task.coverUrl;
    return signOssUrls({ ...task, coverUrl });
  });
  return NextResponse.json({ data: { results: signedResults, total, page, pageSize } });
});

function taskErrorResponse(error: unknown): NextResponse {
  if (error instanceof VideoTaskRequestError) {
    return NextResponse.json(
      { error: error.message, ...error.details },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Failed to create video task" },
    { status: 500 },
  );
}
