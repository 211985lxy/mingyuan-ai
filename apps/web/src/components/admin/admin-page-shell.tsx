"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, RotateCw } from "lucide-react"
import { AdminEmptyState } from "./admin-empty-state"

interface AdminPageShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  stats?: React.ReactNode
  filter?: React.ReactNode
  loading?: boolean
  error?: string | null
  skeletonRows?: number
  empty?: boolean
  emptyMessage?: string
  emptyAction?: React.ReactNode
  onRetry?: () => void
  children?: React.ReactNode
}

export function AdminPageShell({
  title,
  subtitle,
  actions,
  stats,
  filter,
  loading = false,
  error = null,
  skeletonRows = 5,
  empty = false,
  emptyMessage,
  emptyAction,
  onRetry,
  children,
}: AdminPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {stats && <div>{stats}</div>}

      {filter && <div className="flex flex-wrap items-center gap-3">{filter}</div>}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} className="shrink-0 h-7 cursor-pointer">
              <RotateCw className="h-3.5 w-3.5 mr-1" />
              重试
            </Button>
          )}
        </div>
      )}

      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && !error && empty && (
        <AdminEmptyState message={emptyMessage} action={emptyAction} />
      )}

      {!loading && !error && !empty && children}
    </div>
  )
}
