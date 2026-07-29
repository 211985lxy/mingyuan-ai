import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FinalDisposition } from "@/lib/aim/run-outcome-telemetry"

export function AimRunOutcomeActions({
  onSelect,
}: {
  onSelect: (disposition: FinalDisposition) => void
}) {
  return (
    <Select onValueChange={(value) => onSelect(value as FinalDisposition)}>
      <SelectTrigger className="mt-1 h-7 w-[92px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none">
        <SelectValue placeholder="记录结果" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="rewrite_requested">请求重写</SelectItem>
        <SelectItem value="rejected">拒绝本稿</SelectItem>
        <SelectItem value="abandoned">放弃任务</SelectItem>
      </SelectContent>
    </Select>
  )
}
