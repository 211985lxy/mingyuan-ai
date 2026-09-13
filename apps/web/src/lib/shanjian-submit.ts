import {
  generateVirtualmanBroadcast,
  generateRealmanBroadcast,
  generateMaterialMixcut,
  generateNewsMixcut,
  generateRawVideo,
  generateCustomVirtualmanBroadcast,
  generateCustomRealmanBroadcast,
  generateCustomMaterialMixcut,
  generateAICover,
  type ShanjianSubmitResult,
} from "./shanjian"

/**
 * Submit a video task to Shanjian based on videoType and saved payload.
 * Shared by tasks/route.ts (fast path) and task-recovery.ts (queue consumer).
 * The payload is cast via unknown to satisfy the specific request types.
 */
type AnyRecord = any

export async function submitToShanjian(
  videoType: string,
  payload: Record<string, unknown>,
): Promise<ShanjianSubmitResult> {
  const p = payload as AnyRecord
  switch (videoType) {
    case "virtualman_broadcast":
      return generateVirtualmanBroadcast(p)
    case "realman_broadcast":
      return generateRealmanBroadcast(p)
    case "broadcast_mixcut":
      return generateMaterialMixcut(p)
    case "news_mixcut":
      return generateNewsMixcut(p)
    case "virtualman_video":
      return generateRawVideo(p)
    case "custom_virtualman_broadcast":
      return generateCustomVirtualmanBroadcast(p)
    case "custom_realman_broadcast":
      return generateCustomRealmanBroadcast(p)
    case "custom_broadcast_mixcut":
      return generateCustomMaterialMixcut(p)
    case "ai_cover":
      return generateAICover(p)
    default:
      throw new Error(`Unsupported video type: ${videoType}`)
  }
}
