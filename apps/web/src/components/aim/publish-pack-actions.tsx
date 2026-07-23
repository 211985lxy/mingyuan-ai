"use client"

import { useMemo, useState } from "react"
import { Clipboard, Check, Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatPublishPackText } from "@/lib/aim/publish-pack"
import { buildContentDistributionClaimDraft } from "@/lib/aim/content-distribution-claim"
import { request } from "@/lib/api/core"
import type { AimGenerateResponse } from "@/lib/api/client"

export interface PublishPackActionsProps {
  deliverables: AimGenerateResponse
  projectId?: string | null
  projectName?: string | null
  publishPlatform?: string | null
  publishUrl?: string | null
  reviewNote?: string | null
}

/**
 * @description 发布包复制 + 飞书领取（一键创建 / 复制草稿）
 */
export function PublishPackActions({
  deliverables,
  projectId,
  projectName,
  publishPlatform,
  publishUrl,
  reviewNote,
}: PublishPackActionsProps) {
  const [copied, setCopied] = useState<"pack" | "claim" | null>(null)
  const [busy, setBusy] = useState<"pack" | "claim" | "submit" | null>(null)

  const packText = useMemo(
    () =>
      formatPublishPackText({
        generationId: deliverables.id,
        taskSpec: deliverables.taskSpec,
        results: deliverables.results,
        publishPlatform,
        publishUrl,
        reviewNote,
      }),
    [deliverables, publishPlatform, publishUrl, reviewNote],
  )

  const claimDraft = useMemo(
    () =>
      buildContentDistributionClaimDraft({
        generationId: deliverables.id,
        projectId,
        projectName,
        taskSpec: deliverables.taskSpec,
        formats: deliverables.results.map((item) => item.format),
        publishUrl,
        publishPlatform,
        aimBaseUrl: typeof window !== "undefined" ? window.location.origin : "",
      }),
    [deliverables, projectId, projectName, publishUrl, publishPlatform],
  )

  async function copy(kind: "pack" | "claim", text: string) {
    setBusy(kind)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      toast.success(kind === "pack" ? "发布包已复制" : "飞书领取草稿已复制")
      window.setTimeout(() => setCopied(null), 1200)
    } catch {
      toast.error("复制失败")
    } finally {
      setBusy(null)
    }
  }

  async function submitClaim() {
    if (!deliverables.id || deliverables.id.startsWith("polish-")) {
      toast.error("只有已保存的内容才能创建飞书领取事项")
      return
    }
    setBusy("submit")
    try {
      const result = await request<{
        mode: "feishu_upsert" | "copy_only"
        created: boolean
        recordId: string | null
        openUrl: string | null
        draft: { plainText: string }
        reason?: string
      }>(`/api/aim/history/${encodeURIComponent(deliverables.id)}/distribution-claim`, {
        method: "POST",
        body: "{}",
      })

      if (result.mode === "feishu_upsert") {
        toast.success(result.created ? "已创建飞书领取事项" : "已更新飞书领取事项")
        if (result.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer")
        return
      }

      await navigator.clipboard.writeText(result.draft.plainText || claimDraft.plainText)
      toast.message("飞书经营事项未配置，已复制草稿", {
        description: result.reason || "可粘贴到飞书经营事项表手动新建",
      })
      if (result.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建飞书领取事项失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={Boolean(busy)}
        onClick={() => void copy("pack", packText)}
      >
        {busy === "pack" ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : copied === "pack" ? (
          <Check className="mr-1 size-3.5" />
        ) : (
          <Clipboard className="mr-1 size-3.5" />
        )}
        复制发布包
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 text-xs"
        disabled={Boolean(busy)}
        onClick={() => void submitClaim()}
      >
        {busy === "submit" ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <ExternalLink className="mr-1 size-3.5" />
        )}
        一键创建飞书领取
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        disabled={Boolean(busy)}
        onClick={() => void copy("claim", claimDraft.plainText)}
      >
        {copied === "claim" ? <Check className="mr-1 size-3.5" /> : null}
        复制草稿
      </Button>
    </div>
  )
}
