/**
 * AIM 架构护栏（升级阶段 1.4）。
 *
 * 把"Harness 作为 AIM 唯一执行内核"的层依赖边界固化为 CI 检查，防止升级过程
 * 中回退（route 绕过 Harness、Agent 模块反向依赖、AimAgentId 重复定义、
 * 废弃 adapter 新增调用者）。纯静态源码扫描，不跑模型、不连数据库。
 *
 * 规则（与计划阶段 1 一致）：
 *   R1  四个执行入口（aim/generate、aim/chat、agent/v1/aim/generate、
 *       inspiration/[id]/generate）不得直接 import handler / llm /
 *       上下文加载器 —— 必须经 executeAimRun / streamAimRun（阶段 2 迁移后）。
 *       阶段 1：这四入口当前仍调旧 adapter（runAimGenerate 等），故本规则暂以
 *       "白名单 + 失败清单"形式记录现状，迁移完成后收紧为硬失败。
 *   R2  Agent 模块（aim-agent-handlers.ts）不得 import harness-runner / prisma /
 *       model-router。阶段 1：handlers 仍持有持久化与模型路由（已知债，阶段 2.3
 *       handler 改为只接收 PreparedAimContext 后消除），暂列入白名单 + TODO。
 *   R3  AimAgentId 的 `export type` 定义全仓只允许出现在 contracts.ts（唯一源）。
 *       立即硬失败。
 *   R4  旧 adapter 文件和符号已删除，任何回流都硬失败。
 *
 * 退出码：0 通过；1 有硬失败；2 仅有待收紧项（阶段过渡期视为通过，但打印提醒）。
 *
 * 运行：pnpm --dir apps/web exec tsx scripts/check-aim-architecture.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const WEB_ROOT = resolve(__dirname, "..")
const SRC_ROOT = join(WEB_ROOT, "src")

type Finding = {
  rule: string
  severity: "error" | "todo"
  file: string
  detail: string
}

const findings: Finding[] = []

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      // skip generated / node_modules / .next
      if (entry === "generated" || entry === "node_modules" || entry === ".next") continue
      listTsFiles(full, acc)
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      acc.push(full)
    }
  }
  return acc
}

function rel(p: string): string {
  return relative(WEB_ROOT, p)
}

function read(file: string): string {
  return readFileSync(file, "utf8")
}

// ── R3：AimAgentId 唯一源（立即硬失败）─────────────────────────────────────
function checkR3(files: string[]) {
  const ALLOWED = "src/lib/aim-harness/contracts.ts"
  for (const file of files) {
    const text = read(file)
    if (/export\s+type\s+AimAgentId\b/.test(text) && rel(file) !== ALLOWED) {
      findings.push({
        rule: "R3",
        severity: "error",
        file: rel(file),
        detail: `重新定义了 export type AimAgentId；唯一源只能是 ${ALLOWED}`,
      })
    }
  }
}

// ── R1：四个执行入口不得直接 import handler/prisma/llm/context-loader ──────
const EXEC_ENTRYPOINTS = [
  "src/app/api/aim/generate/route.ts",
  "src/app/api/aim/chat/route.ts",
  "src/app/api/agent/v1/aim/generate/route.ts",
  "src/app/api/inspiration/[id]/generate/route.ts",
]

// 阶段 1 基线：这些入口当前确实直接 import 了底层模块（迁移完成后应全部清零）。
// 列为 todo，迁移完成后把 forbidden 改为硬失败。
const R1_FORBIDDEN = [
  /from\s+["']@\/lib\/aim-harness\/adapters["']/,
  /from\s+["']@\/lib\/aim-agent-handlers["']/,
  /from\s+["']@\/lib\/aim-generator["']/,
  /from\s+["']@\/lib\/aim-generate-context["']/,
  /from\s+["']@\/lib\/llm\/agent-router["']/,
]

function checkR1() {
  for (const ep of EXEC_ENTRYPOINTS) {
    const full = join(WEB_ROOT, ep)
    let text: string
    try {
      text = read(full)
    } catch {
      findings.push({ rule: "R1", severity: "error", file: ep, detail: "执行入口文件缺失" })
      continue
    }
    if (!/\b(executeAimRun|streamAimRun)\b/.test(text)) {
      findings.push({
        rule: "R1",
        severity: "error",
        file: ep,
        detail: "正式 AIM 入口必须调用 executeAimRun 或 streamAimRun",
      })
    }
    for (const re of R1_FORBIDDEN) {
      const m = text.match(re)
      if (m) {
        findings.push({
          rule: "R1",
          severity: "todo",
          file: ep,
          detail: `直接 import 底层模块（${m[0]}）；阶段 2 入口迁移到 executeAimRun 后应移除`,
        })
      }
    }
  }
}

// ── R2：Agent 模块不得 import runner/prisma/model-router ────────────────────
function checkR2() {
  const handler = join(SRC_ROOT, "lib", "aim-agent-handlers.ts")
  const text = read(handler)
  const bans: Array<{ re: RegExp; todo: string }> = [
    {
      re: /from\s+["']\.\/aim-harness\/runner["']|from\s+["']@\/lib\/aim-harness\/runner["']/,
      todo: "Agent 不得依赖 harness runner（反向依赖）",
    },
    {
      re: /from\s+["']@\/lib\/prisma["']/,
      todo: "阶段 2.3：handler 改为只接收 PreparedAimContext 后移除 prisma 依赖",
    },
    {
      re: /from\s+["']@\/lib\/llm\/agent-router["']/,
      todo: "阶段 2.1/2.3：模型路由上移到 planner/model-policy 后移除",
    },
  ]
  for (const { re, todo } of bans) {
    if (re.test(text)) {
      findings.push({
        rule: "R2",
        severity: "todo",
        file: "src/lib/aim-agent-handlers.ts",
        detail: todo,
      })
    }
  }
}

// ── R4：废弃 adapter 不得有新增调用者 ───────────────────────────────────────
const R4_DEPRECATED = /\b(runAimGenerate|runAimChat|planAimChatStream)\b/

function checkR4(files: string[]) {
  for (const file of files) {
    const rp = rel(file)
    const text = read(file)
    if (R4_DEPRECATED.test(text)) {
      findings.push({
        rule: "R4",
        severity: "error",
        file: rp,
        detail: "引用了已废弃 adapter（runAimGenerate/runAimChat/planAimChatStream）；新入口必须用 executeAimRun/streamAimRun",
      })
    }
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function main() {
  const files = listTsFiles(SRC_ROOT)
  checkR3(files)
  checkR1()
  checkR2()
  checkR4(files)

  const errors = findings.filter((f) => f.severity === "error")
  const todos = findings.filter((f) => f.severity === "todo")

  if (todos.length > 0) {
    console.log(`\n⚠️  待收紧项（${todos.length}，阶段过渡期不阻断，迁移完成后清零）：`)
    for (const f of todos) {
      console.log(`  [${f.rule}] ${f.file}\n        ${f.detail}`)
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ 架构护栏硬失败（${errors.length}）：`)
    for (const f of errors) {
      console.error(`  [${f.rule}] ${f.file}\n        ${f.detail}`)
    }
    process.exit(1)
  }

  if (todos.length > 0) {
    console.log(`\n✅ 硬规则全部通过（${todos.length} 项待阶段 2 收紧）。`)
    process.exit(2)
  }

  console.log("\n✅ AIM 架构护栏全部通过，无待收紧项。")
}

main()
