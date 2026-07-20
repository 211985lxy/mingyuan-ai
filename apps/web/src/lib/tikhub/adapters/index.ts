import type { Platform, PlatformAdapter } from '../types'
import { DouyinAdapter } from './douyin'
import { XiaohongshuAdapter } from './xiaohongshu'
import { WechatChannelsAdapter } from './wechat-channels'

export { DouyinAdapter } from './douyin'
export { XiaohongshuAdapter } from './xiaohongshu'
export { WechatChannelsAdapter } from './wechat-channels'

/**
 * Returns the platform adapter for the given platform.
 * Throws if platform is not supported in this MVP.
 */
/**
 * @description 获取adapter
 * @param platform - 平台
 * @returns PlatformAdapter
 */
export function getAdapter(platform: Platform): PlatformAdapter {
  switch (platform) {
    case 'douyin':
      return new DouyinAdapter()
    case 'xiaohongshu':
      return new XiaohongshuAdapter()
    case 'wechat_channels':
      return new WechatChannelsAdapter()
    case 'bilibili':
    case 'kuaishou':
      throw new Error(`Platform '${platform}' is not supported in MVP. Deferred to Phase 2.`)
    default: {
      const _exhaustive: never = platform
      throw new Error(`Unknown platform: ${String(_exhaustive)}`)
    }
  }
}
