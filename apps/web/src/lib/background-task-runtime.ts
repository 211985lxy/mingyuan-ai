import { env } from "@/env"

/**
 * @description arebackgroundtasksenabled
 * @returns 无返回值
 */
export function areBackgroundTasksEnabled() {
  return env.NODE_ENV !== "production" || env.BACKGROUND_TASKS_ENABLED === "true"
}
