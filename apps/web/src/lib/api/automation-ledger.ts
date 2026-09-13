"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import type { AutomationLedger } from "@/lib/aim/automation-ledger"

export type { AutomationLedger, AutomationLedgerJob, AutomationHealth } from "@/lib/aim/automation-ledger"

export async function fetchAutomationLedger(): Promise<AutomationLedger> {
  return request<AutomationLedger>("/api/aim/automation-ledger")
}

export { ApiError, getApiErrorMessage }
