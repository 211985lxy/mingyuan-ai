"use client"

import React from "react"
import { JiekouTestPanel } from "@/features/knowledge/components/jiekou-test-panel"

export default function AdminRetrievalTestPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">检索测试</h1>
        <p className="text-sm text-muted-foreground mt-1">
          测试模型接口的连接和响应效果，验证知识库检索与生成质量。
        </p>
      </div>
      <JiekouTestPanel />
    </div>
  )
}
