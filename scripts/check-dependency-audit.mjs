import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const exceptions = JSON.parse(
  readFileSync(resolve("security/dependency-audit-exceptions.json"), "utf8"),
)
const result = spawnSync("pnpm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
})

if (!result.stdout.trim()) {
  console.error(result.stderr || "pnpm audit returned no JSON output")
  process.exit(1)
}

let report
try {
  report = JSON.parse(result.stdout)
} catch (error) {
  console.error("Unable to parse pnpm audit output", error)
  process.exit(1)
}

const blocking = []
const accepted = []
const today = new Date().toISOString().slice(0, 10)

for (const advisory of Object.values(report.advisories ?? {})) {
  if (!advisory || !["high", "critical"].includes(advisory.severity)) continue

  const id = advisory.github_advisory_id || String(advisory.id)
  const exception = exceptions[id]
  if (!exception) {
    blocking.push(`${id} ${advisory.severity} ${advisory.module_name}`)
    continue
  }
  if (!exception.expiresOn || exception.expiresOn < today) {
    blocking.push(`${id} exception expired on ${exception.expiresOn || "unknown"}`)
    continue
  }
  accepted.push(`${id} ${advisory.module_name} accepted until ${exception.expiresOn}`)
}

for (const line of accepted) console.log(`audit-exception: ${line}`)
if (blocking.length > 0) {
  console.error("Unapproved high or critical dependency advisories:")
  for (const line of blocking) console.error(`  - ${line}`)
  process.exit(1)
}

const counts = report.metadata?.vulnerabilities ?? {}
console.log(
  `dependency-audit-ok critical=${counts.critical ?? 0} high=${counts.high ?? 0} approved=${accepted.length}`,
)
