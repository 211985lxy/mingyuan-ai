import type { FalsificationRow } from "@/lib/competitor-diagnosis/types"

/**
 * ponytail: 收尾区块只保留错因、验证、修正信号，避免大表格占高度。
 */
/**
 * @description falsificationtable
 * @param options - 配置选项
 * @returns 无返回值
 */
export function FalsificationTable({ rows }: { rows: FalsificationRow[] }) {
  if (!rows.length) return null

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-foreground">{row.claim}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            若{row.couldBeWrongIf}；看{row.verifyBy}；信号：{row.correctionSignal}
          </p>
        </div>
      ))}
    </div>
  )
}
