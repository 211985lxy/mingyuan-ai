#!/usr/bin/env tsx
/**
 * 记忆治理评估 CLI：pnpm --dir apps/web run eval:memory
 */
import {
  MEMORY_EVAL_SUITE,
  renderMemoryEvalMarkdown,
  runMemoryEvalSuite,
} from "../src/lib/aim-harness/memory-eval"

const report = runMemoryEvalSuite(MEMORY_EVAL_SUITE)
process.stdout.write(`${renderMemoryEvalMarkdown(report)}\n`)
if (report.total < 20) {
  console.error(`记忆评估集不足 20 条：实际 ${report.total}`)
  process.exit(1)
}
if (report.failed > 0) {
  process.exit(1)
}
