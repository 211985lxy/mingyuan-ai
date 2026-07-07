import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runTaskRecoveryPass } from "@/lib/task-recovery";

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 5 * 1000;
const HEARTBEAT_FILE =
  process.env.TASK_RECOVERY_HEARTBEAT_FILE ??
  "/tmp/mingyuan-task-recovery-heartbeat.json";

function readIntervalMs(envValue: string | undefined, fallback: number): number {
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeHeartbeat(state: "starting" | "ok" | "error", meta?: object) {
  await mkdir(dirname(HEARTBEAT_FILE), { recursive: true });
  await writeFile(
    HEARTBEAT_FILE,
    JSON.stringify(
      {
        state,
        timestamp: new Date().toISOString(),
        ...meta,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const intervalMs = readIntervalMs(
    process.env.TASK_RECOVERY_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  const startupDelayMs = readIntervalMs(
    process.env.TASK_RECOVERY_STARTUP_DELAY_MS,
    DEFAULT_STARTUP_DELAY_MS,
  );
  let stopping = false;

  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  console.log(
    `[task-recovery:worker] Starting worker with interval ${intervalMs}ms`,
  );
  await writeHeartbeat("starting", { intervalMs });

  if (startupDelayMs > 0) {
    await sleep(startupDelayMs);
  }

  while (!stopping) {
    const startedAt = Date.now();

    try {
      const summary = await runTaskRecoveryPass({ trigger: "worker" });
      await writeHeartbeat("ok", { intervalMs, summary });
      console.log("[task-recovery:worker] Pass completed", summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeHeartbeat("error", { intervalMs, error: message });
      console.error("[task-recovery:worker] Pass failed:", error);
    }

    const elapsedMs = Date.now() - startedAt;
    const sleepMs = Math.max(0, intervalMs - elapsedMs);

    if (sleepMs > 0 && !stopping) {
      await sleep(sleepMs);
    }
  }

  console.log("[task-recovery:worker] Shutdown complete");
}

main().catch((error) => {
  console.error("[task-recovery:worker] Fatal startup error:", error);
  process.exitCode = 1;
});
