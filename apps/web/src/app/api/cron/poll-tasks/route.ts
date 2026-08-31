import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/admin-auth";
import { runTaskRecoveryPass } from "@/lib/task-recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── GET /api/cron/poll-tasks ───────────────────────────

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const polled = await runTaskRecoveryPass({ trigger: "cron" });

    return NextResponse.json({
      data: {
        polled,
      },
    });
  } catch (error) {
    console.error("[cron/poll-tasks] failed:", error);
    return NextResponse.json({ error: "任务恢复轮询失败" }, { status: 502 });
  }
}
