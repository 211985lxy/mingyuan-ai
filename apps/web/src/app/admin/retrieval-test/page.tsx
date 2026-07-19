"use client"

import React from "react"
import { JiekouTestPanel } from "@/features/knowledge/components/jiekou-test-panel"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

export default function AdminRetrievalTestPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="检索测试"
        description="测试模型连接与响应质量，验证知识库检索和最终生成是否符合预期。"
      />
      <JiekouTestPanel />
    </div>
  )
}
