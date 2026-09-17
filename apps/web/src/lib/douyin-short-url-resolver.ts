/**
 * 抖音短链解析（服务端网络动作）。
 *
 * 与纯函数模块 `@/lib/douyin-short-url` 分离的原因：本文件依赖 `ssrf-guard.server`
 * （node:dns / undici），而纯函数模块在客户端图里，绝不能引入 node 依赖。
 *
 * F18：短链探测是 Web 层唯一直连「用户/库内可控 URL」的出网点。现所有探测统一走
 * `probeRedirect`（解析全部地址均须公网 + 钉 IP + 不自动跟随重定向 + 跳转目标二次校验），
 * 并只接受 `v.douyin.com` 严格主机白名单，故 F18-A（实时 POST）/ F18-B（cron 存量）两条
 * 路径一并收敛到此处。
 */
import { logger } from "@/lib/logger"
import { incrementSecurityMetric } from "@/lib/security-metrics"
import { isDouyinShortUrl, normalizeDouyinAwemeId } from "@/lib/douyin-short-url"
import { probeRedirect, SsrfBlockedError } from "@/lib/ssrf-guard.server"

const SHORT_LINK_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"

/** 探测 v.douyin.com 分享短链的 302 长链；失败时退回原 URL，由调用方按无统计处理。 */
export async function resolveDouyinShortUrl(url: string): Promise<string> {
  if (!isDouyinShortUrl(url)) return url
  try {
    const location = await probeRedirect(url, { headers: { "User-Agent": SHORT_LINK_UA } })
    if (location) return location
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      incrementSecurityMetric("ssrf.blocked", { reason: "douyin_short_url" })
    } else {
      // 非 SSRF 拦截的运行期失败（DNS/连接/udici 配置等）也**必须**留下信号。
      // 这里曾长期只打 SsrfBlockedError 的点，导致「钉 IP 回调签名与 Node
      // autoSelectFamily 不兼容」这类缺陷完全静默——业务侧只表现为短链统计变零。
      incrementSecurityMetric("ssrf.short_url_error", { reason: "unexpected" })
      logger.warn({ event: "ssrf.short_url_error", error: String(error) }, "短链探测异常")
    }
    // 短链探测失败时不抛错，调用方降级为「无统计」
  }
  return url
}

export async function resolveDouyinAwemeId(url: string): Promise<string | null> {
  const direct = normalizeDouyinAwemeId(url)
  if (direct) return direct
  if (!isDouyinShortUrl(url)) return null
  return normalizeDouyinAwemeId(await resolveDouyinShortUrl(url))
}
