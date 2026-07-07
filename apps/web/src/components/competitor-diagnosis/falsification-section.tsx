import { SectionTitle } from "./section-title"
import { FalsificationTable } from "./falsification-table"
import type { FalsificationRow } from "@/lib/competitor-diagnosis/types"

/**
 * 反证条件汇总：从五层诊断汇总"判断可能错在哪里"。
 */
export function FalsificationSection({ rows }: { rows: FalsificationRow[] }) {
  if (!rows.length) return null

  return (
    <section className="space-y-3">
      <SectionTitle
        title="反证条件汇总"
        subtitle="出现这些信号时，本报告的判断需要修正。报告不是拍脑袋，而是可被验证和推翻。"
        anchor="falsification"
      />
      <FalsificationTable rows={rows} />
    </section>
  )
}
