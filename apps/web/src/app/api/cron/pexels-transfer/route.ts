import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/admin-auth";
import { transferPendingPexelsMedia } from "@/lib/pexels-oss";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── GET /api/cron/pexels-transfer ──────────────────────

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const transferred = await transferPendingPexelsMedia(20);

    return NextResponse.json({
      data: { transferred },
    });
  } catch (error) {
    console.error("[cron/pexels-transfer] failed:", error);
    return NextResponse.json({ error: "Pexels 媒体转存失败" }, { status: 502 });
  }
}
