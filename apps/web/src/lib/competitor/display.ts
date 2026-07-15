export function formatCompetitorCount(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`
  return value.toLocaleString("zh-CN")
}
