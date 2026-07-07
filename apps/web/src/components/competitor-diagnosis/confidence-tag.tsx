import { Badge } from "@/components/ui/badge"
import { CONFIDENCE_STYLES } from "@/lib/competitor-diagnosis/format"
import type { ConfidenceLevel } from "@/lib/competitor-diagnosis/types"

export function ConfidenceTag({
  level,
  reason,
  className,
}: {
  level: ConfidenceLevel
  reason?: string
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      title={reason}
      className={`border font-medium ${CONFIDENCE_STYLES[level]} ${className ?? ""}`}
    >
      置信度 · {level}
    </Badge>
  )
}
