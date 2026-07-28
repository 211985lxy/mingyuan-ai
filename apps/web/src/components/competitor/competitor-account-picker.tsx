"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import type { WatchAccount } from "@/lib/api/client"
import { formatCompetitorAccountName } from "@/lib/competitor/display"
import { cn } from "@/lib/utils"

interface CompetitorAccountPickerProps {
  accounts: WatchAccount[]
  activeAccount: WatchAccount
  disabled?: boolean
  onActivate: (id: string) => void
}

/** 可输入筛选的账号框：打字定位已监控账号。 */
export function CompetitorAccountPicker(props: CompetitorAccountPickerProps) {
  const { accounts, activeAccount, disabled, onActivate } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(formatCompetitorAccountName(activeAccount))
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter((a) => formatCompetitorAccountName(a).toLowerCase().includes(keyword))
  }, [accounts, query])

  const pick = (account: WatchAccount) => {
    onActivate(account.id)
    setQuery(formatCompetitorAccountName(account))
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <Input
        value={query}
        disabled={disabled}
        placeholder="输入账号名筛选，或从列表选择"
        aria-label="选择监控账号"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        className="h-9"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setQuery(formatCompetitorAccountName(activeAccount)); setOpen(false); return }
          if (e.key === "Enter") { e.preventDefault(); if (filtered[0]) pick(filtered[0]) }
        }}
      />
      {open ? (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">没有匹配的监控账号</li>
          ) : filtered.map((account) => {
            const active = account.id === activeAccount.id
            return (
              <li key={account.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn("flex w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors", active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(account)}
                >
                  {formatCompetitorAccountName(account)}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
