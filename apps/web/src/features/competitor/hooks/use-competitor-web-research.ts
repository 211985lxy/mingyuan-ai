import { useState } from "react"
import { toast } from "sonner"
import { runCompetitorWebResearch } from "@/lib/api/client"
import type { ApiCompetitorWebResearch } from "@/types/api"

export function useCompetitorWebResearch() {
  const [researchQuery, setResearchQuery] = useState("")
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchResult, setResearchResult] = useState<ApiCompetitorWebResearch | null>(null)

  async function research() {
    const query = researchQuery.trim()
    if (!query) {
      toast.error("先输入一个要补证的关键词")
      return
    }

    setResearchLoading(true)
    try {
      const result = await runCompetitorWebResearch(query)
      setResearchResult(result)
      if (result.warnings.length > 0) {
        toast.warning(result.warnings[0])
      } else {
        toast.success(`已补到 ${result.items.length} 条公开线索`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全网补证失败")
    } finally {
      setResearchLoading(false)
    }
  }

  return {
    researchLoading,
    researchQuery,
    researchResult,
    research,
    setResearchQuery,
  }
}
