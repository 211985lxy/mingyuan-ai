/** China-market posting patterns use Asia/Shanghai, not the host TZ. */
const SHANGHAI_TZ = 'Asia/Shanghai'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type WeekdayShort = (typeof WEEKDAYS)[number]

export function shanghaiWeekdayAndHour(unixSeconds: number): {
  day: WeekdayShort
  hour: number
} {
  const date = new Date(unixSeconds * 1000)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TZ,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const hourRaw = parts.find((part) => part.type === 'hour')?.value ?? '0'
  const hour = Number(hourRaw) % 24
  const day = (WEEKDAYS.includes(weekday as WeekdayShort) ? weekday : 'Mon') as WeekdayShort

  return { day, hour }
}
