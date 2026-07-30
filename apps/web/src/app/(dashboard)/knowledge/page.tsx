"use client"

import { Suspense } from "react"
import { CustomerKnowledgeWorkspace } from "@/features/knowledge/components/customer-knowledge-workspace"

function KnowledgeFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
      正在打开知识库…
    </div>
  )
}

export default function CustomerKnowledgePage() {
  return (
    <Suspense fallback={<KnowledgeFallback />}>
      <CustomerKnowledgeWorkspace />
    </Suspense>
  )
}
