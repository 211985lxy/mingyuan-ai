"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AdminPaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function AdminPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">
        显示 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}，共 {total} 条
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="cursor-pointer">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="cursor-pointer">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
