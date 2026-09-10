const SHANGHAI_TIME_ZONE = "Asia/Shanghai"

export interface ShanghaiDateRange {
  from: string
  to: string
  start: Date
  end: Date
}

export type ShanghaiDateRangeResult = ShanghaiDateRange | { error: string }

function formatDateParts(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function isValidDateText(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function shiftDateText(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

function shanghaiMidnight(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`)
}

/** Parse inclusive Shanghai calendar dates into a half-open UTC interval. */
export function parseShanghaiDateRange(
  searchParams: URLSearchParams,
  now = new Date(),
): ShanghaiDateRangeResult {
  const requestedFrom = searchParams.get("from")?.trim() || null
  const requestedTo = searchParams.get("to")?.trim() || null
  const defaultTo = formatDateParts(now)
  const to = requestedTo || defaultTo
  const from = requestedFrom || shiftDateText(to, -6)

  if (!isValidDateText(from) || !isValidDateText(to)) {
    return { error: "日期必须是有效的 YYYY-MM-DD" }
  }
  const start = shanghaiMidnight(from)
  const end = shanghaiMidnight(shiftDateText(to, 1))
  if (start >= end) return { error: "from 必须不晚于 to" }
  if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) {
    return { error: "查询周期不得超过 31 天" }
  }
  return { from, to, start, end }
}

export function shanghaiDateText(date: Date): string {
  return formatDateParts(date)
}

export function nextShanghaiDateText(value: string): string {
  if (!isValidDateText(value)) throw new Error("日期必须是有效的 YYYY-MM-DD")
  return shiftDateText(value, 1)
}

export const SHANGHAI_TIME_ZONE_NAME = SHANGHAI_TIME_ZONE
