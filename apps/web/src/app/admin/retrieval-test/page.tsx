"use client"

import React from "react"
import Link from "next/link"
import { JiekouTestPanel } from "@/features/knowledge/components/jiekou-test-panel"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { Button } from "@/components/ui/button"

export default function AdminRetrievalTestPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="检索测试"
        description="测试模型连接与响应质量，验证知识库检索和最终生成是否符合预期。"
        actions={<>
          <Link href="/admin/methodology"><Button variant="outline" size="sm">查看方法论</Button></Link>
          <Link href="/admin/agents"><Button variant="outline" size="sm">查看执行观测</Button></Link>
        </>}
      />
      <JiekouTestPanel />
    </div>
  )
}
