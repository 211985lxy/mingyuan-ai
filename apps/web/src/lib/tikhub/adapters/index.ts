import type { Platform, PlatformAdapter } from '../types'
import { DouyinAdapter } from './douyin'
import { XiaohongshuAdapter } from './xiaohongshu'

export { DouyinAdapter } from './douyin'
export { XiaohongshuAdapter } from './xiaohongshu'

/**
 * Returns the platform adapter for the given platform.
 * Throws if platform is not supported in this MVP.
 */
export function getAdapter(platform: Platform): PlatformAdapter {
  switch (platform) {
    case 'douyin':
      return new DouyinAdapter()
    case 'xiaohongshu':
      return new XiaohongshuAdapter()
    case 'bilibili':
    case 'kuaishou':
      throw new Error(`Platform '${platform}' is not supported in MVP. Deferred to Phase 2.`)
    default: {
      const _exhaustive: never = platform
      throw new Error(`Unknown platform: ${String(_exhaustive)}`)
    }
  }
}
