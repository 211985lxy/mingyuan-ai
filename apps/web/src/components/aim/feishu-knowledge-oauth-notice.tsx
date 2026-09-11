"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

export function FeishuKnowledgeOauthNotice() {
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get("feishu_knowledge_error")
    const connected = params.get("feishu_knowledge")
    if (connected === "connected") {
      const text = "飞书知识库已连上。在对话里问知识库里的内容，就会去搜。"
      setOk(true)
      setMessage(text)
      toast.success(text)
    } else if (error) {
      setOk(false)
      setMessage(error)
      toast.error(error)
    } else {
      return
    }
    params.delete("feishu_knowledge_error")
    params.delete("feishu_knowledge")
    const query = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`)
  }, [])

  if (!message) return null
  return (
    <div
      className={
        ok
          ? "border-b bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground"
          : "border-b bg-destructive/10 px-3 py-1 text-[11px] text-destructive"
      }
    >
      {message}
    </div>
  )
}
