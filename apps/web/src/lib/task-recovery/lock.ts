import { redis } from "@/lib/redis";

const CRON_LOCK_TTL_SECONDS = 55;

export async function acquireTaskRecoveryLock(lockKey: string): Promise<boolean> {
  try {
    const set = await redis.set(lockKey, "1", "EX", CRON_LOCK_TTL_SECONDS, "NX");
    return Boolean(set);
  } catch (error) {
    // Fail closed so a Redis outage cannot duplicate paid external work.
    console.error(
      "[task-recovery] acquireTaskRecoveryLock 失败,本轮跳过(避免重复处理):",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
