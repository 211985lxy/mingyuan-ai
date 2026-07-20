import { useState } from "react"
import { toast } from "sonner"
import { discoverSimilarAccounts, type SimilarAccount } from "@/lib/api/client"
import { validateCompetitorUrl } from "@/features/competitor/competitor-url-utils"

/**
 * @description React Hook：competitordiscovery
 * @returns 无返回值
 */
export function useCompetitorDiscovery() {
  const [discovering, setDiscovering] = useState(false)
  const [discoveryAttempted, setDiscoveryAttempted] = useState(false)
  const [peerAccounts, setPeerAccounts] = useState<SimilarAccount[]>([])
  const [leaderAccounts, setLeaderAccounts] = useState<SimilarAccount[]>([])
  const [ignoredDiscoveryUrls, setIgnoredDiscoveryUrls] = useState<Set<string>>(new Set())

  async function discover(targetUrl: string) {
    if (!targetUrl.trim()) {
      toast.error("先选择一个已监控账号")
      return
    }
    const validated = validateCompetitorUrl(targetUrl)
    if (!validated.ok) {
      toast.error(validated.error)
      return
    }

    setDiscovering(true)
    setDiscoveryAttempted(true)
    try {
      const result = await discoverSimilarAccounts(validated.url)
      setPeerAccounts(result.peerAccounts)
      setLeaderAccounts(result.leaderAccounts)
      setIgnoredDiscoveryUrls(new Set())
      if (result.peerAccounts.length + result.leaderAccounts.length === 0) {
        toast.info("暂未找到可用对标账号，可以换一个更明确的赛道账号")
      }
    } catch {
      toast.error("当前账号暂时无法自动扩展同赛道，监控和作品池不受影响")
    } finally {
      setDiscovering(false)
    }
  }

  function ignore(url: string) {
    setIgnoredDiscoveryUrls((previous) => new Set(previous).add(url))
  }

  return { discover, discovering, discoveryAttempted, ignoredDiscoveryUrls, ignore, leaderAccounts, peerAccounts }
}
