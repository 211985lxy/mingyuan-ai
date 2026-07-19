import { env } from "@/env"

export function areBackgroundTasksEnabled() {
  return env.NODE_ENV !== "production" || env.BACKGROUND_TASKS_ENABLED === "true"
}
