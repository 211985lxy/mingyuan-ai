import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { FalsificationRow } from "@/lib/competitor-diagnosis/types"

/**
 * 反证表：列出"这个判断可能错在哪里、如何验证、何时需要修正"。
 */
export function FalsificationTable({ rows }: { rows: FalsificationRow[] }) {
  if (!rows.length) return null

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-[22%] text-xs">论断</TableHead>
            <TableHead className="text-xs">可能在何种情况下不成立</TableHead>
            <TableHead className="text-xs">如何验证</TableHead>
            <TableHead className="text-xs">修正信号</TableHead>
            <TableHead className="text-xs">误判成本</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs font-medium align-top">{row.claim}</TableCell>
              <TableCell className="text-xs text-muted-foreground align-top">
                {row.couldBeWrongIf}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground align-top">
                {row.verifyBy}
              </TableCell>
              <TableCell className="text-xs text-amber-700 align-top">
                {row.correctionSignal}
              </TableCell>
              <TableCell className="text-xs text-red-600/80 align-top">
                {row.misjudgeCost}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
