"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { request } from "@/lib/api/core"
import { ASSET_CANDIDATE_KIND_LABELS } from "@/lib/aim/asset-candidates"
import { IP_WIKI_PAGE_TYPE_LABELS, type IpWikiPageType } from "@/lib/ip-wiki/types"

/** wiki_patch 候选不在 ASSET_CANDIDATE_KIND_LABELS 中，单独给中文标签。 */
const WIKI_PATCH_KIND_LABEL = "维基补充候选"

interface AssetCandidateItem {
  id: string
  kind: string
  /** wiki_patch 候选的目标 IP 维基页类型；其他 kind 为 null/undefined。 */
  wikiPageType?: string | null
  title: string
  content: string
  confidence: string
  reviewStatus: string
  evidence?: string | null
}

function kindLabel(kind: string, wikiPageType?: string | null): string {
  if (kind === "wiki_patch") {
    const pageLabel =
      wikiPageType && wikiPageType in IP_WIKI_PAGE_TYPE_LABELS
        ? IP_WIKI_PAGE_TYPE_LABELS[wikiPageType as IpWikiPageType]
        : wikiPageType ?? ""
    return pageLabel ? `${WIKI_PATCH_KIND_LABEL}·${pageLabel}` : WIKI_PATCH_KIND_LABEL
  }
  return ASSET_CANDIDATE_KIND_LABELS[itemKindAsKey(kind)] || kind
}

function itemKindAsKey(kind: string): keyof typeof ASSET_CANDIDATE_KIND_LABELS {
  return kind as keyof typeof ASSET_CANDIDATE_KIND_LABELS
}

interface ProjectAssetCandidateReviewProps {
  projectId: string
}

/**
 * @description 项目内待审资产候选最小入口（不新建大页，挂在知识健康度旁）
 */
export function ProjectAssetCandidateReview({ projectId }: ProjectAssetCandidateReviewProps) {
  const [items, setItems] = useState<AssetCandidateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [workflowId, setWorkflowId] = useState("content-growth-v1")
  const [approvalId, setApprovalId] = useState("")

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await request<{ candidates: AssetCandidateItem[] }>(
        `/api/aim/asset-candidates?projectId=${encodeURIComponent(projectId)}&reviewStatus=pending&take=20`,
      )
      setItems(payload.candidates || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function review(id: string, action: "approve" | "reject", promote = false) {
    setBusyId(id)
    try {
      await request(`/api/aim/asset-candidates/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          promote,
          workflowId: promote ? workflowId : undefined,
          approvalId: promote ? approvalId : undefined,
        }),
      })
      toast.success(action === "approve" ? (promote ? "已批准并写入知识库" : "已批准") : "已拒绝")
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "审核失败")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        检查资产候选…
      </p>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">待审资产候选</p>
          <p className="text-[11px] text-muted-foreground">
            {items.length} 条待人工确认；批准后可写入知识库，AI 不会自动落库
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "展开审核"}
        </Button>
      </div>

      {expanded ? (
        <>
          <div className="mt-3 grid gap-2 rounded-lg border border-border/70 bg-card p-2.5 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="asset-workflow-id" className="text-xs">工作流 ID</Label>
              <Input
                id="asset-workflow-id"
                value={workflowId}
                onChange={(event) => setWorkflowId(event.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="asset-approval-id" className="text-xs">approvalId</Label>
              <Input
                id="asset-approval-id"
                value={approvalId}
                onChange={(event) => setApprovalId(event.target.value)}
                placeholder="治理责任页签字后粘贴"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border/70 bg-card p-2.5">
              <p className="text-xs font-medium text-foreground">
                {kindLabel(item.kind, item.wikiPageType)}
                {" · "}
                {item.title}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground whitespace-pre-wrap">
                {item.content}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busyId === item.id}
                  onClick={() => void review(item.id, "approve", true)}
                >
                  {busyId === item.id ? <Loader2 className="size-3 animate-spin" /> : null}
                  批准并入库
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={busyId === item.id}
                  onClick={() => void review(item.id, "approve", false)}
                >
                  仅批准
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  disabled={busyId === item.id}
                  onClick={() => void review(item.id, "reject")}
                >
                  拒绝
                </Button>
              </div>
            </li>
          ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
