/**
 * 长函数计数器（长函数拆分计划 WP-0）。
 *
 * 与 check-aim-architecture.ts 同源的静态源码扫描工具，但职责不同：
 * 架构护栏管"Harness 边界 / 不可变契约"，本工具管"长函数清零进度"。
 *
 * 用 TypeScript 编译器 AST 精确测量每个函数体的行数（从声明起点到闭括号），
 * 不靠正则或大括号启发式——后者在模板字符串 / 嵌套箭头函数下会误判。
 *
 * 计为"函数"的 AST 形态：
 *   - FunctionDeclaration（含 async / export），如 `export async function POST`
 *   - 命名箭头函数 / 函数表达式：`const foo = () => {}`、`export const bar = async () => {}`
 *   - 类方法 MethodDeclaration
 *
 * 计为"行数"：从声明起点（含 export/const 关键字，或方法名）到闭括号的源码行数。
 * 这与人工"这个函数多少行"的直觉一致，也与历史审计的口径一致。
 *
 * 用法：
 *   # 报告（默认阈值 80 行，退出码恒为 0）
 *   pnpm --dir apps/web exec tsx scripts/count-long-functions.ts
 *
 *   # 指定阈值
 *   pnpm --dir apps/web exec tsx scripts/count-long-functions.ts --threshold 60
 *
 *   # 写出基线 JSON（WP-12 起步时固化真实计数）
 *   pnpm --dir apps/web exec tsx scripts/count-long-functions.ts --write-baseline
 *
 *   # 回归门禁：当前总数超过基线则失败（每个 WP 提交前跑）
 *   pnpm --dir apps/web exec tsx scripts/count-long-functions.ts --enforce
 *
 * 退出码：报告模式恒 0；--enforce 模式下当前总数 > 基线总数时返回 1。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import * as ts from "typescript"

const WEB_ROOT = resolve(__dirname, "..")
const SRC_ROOT = join(WEB_ROOT, "src")
const BASELINE_PATH = join(WEB_ROOT, "scripts", "long-functions.baseline.json")
const DEFAULT_THRESHOLD = 80

type Args = {
  threshold: number
  writeBaseline: boolean
  enforce: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { threshold: DEFAULT_THRESHOLD, writeBaseline: false, enforce: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--threshold") {
      const v = Number(argv[++i])
      if (Number.isFinite(v) && v > 0) args.threshold = Math.floor(v)
    } else if (a === "--write-baseline") {
      args.writeBaseline = true
    } else if (a === "--enforce") {
      args.enforce = true
    }
  }
  return args
}

type LongFunction = {
  file: string
  name: string
  startLine: number
  endLine: number
  lines: number
}

function listTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      // 与 check-aim-architecture.ts 同口径：跳过生成物 / 依赖
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

/**
 * 收集单个文件里超过阈值的函数。
 *
 * 命名箭头函数 / 函数表达式要向上找 VariableStatement 的起点，这样
 * `export const POST = async (request) => { ... }` 的行数才包含 export/const/名字，
 * 而不是只从箭头 `=>` 算起——否则路由处理函数会被系统性低估。
 */
function collectLongFunctions(file: string, threshold: number): LongFunction[] {
  const text = readFileSync(file, "utf8")
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true)
  const fileName = rel(file)
  const out: LongFunction[] = []
  const lineStarts = sourceFile.getLineStarts()

  const lineOf = (pos: number) => ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1

  function push(name: string, startPos: number, endPos: number) {
    const startLine = lineOf(startPos)
    const endLine = lineOf(endPos)
    const lines = endLine - startLine + 1
    if (lines > threshold) {
      out.push({ file: fileName, name, startLine, endLine, lines })
    }
  }

  const visit = (node: ts.Node) => {
    // 命名箭头函数 / 函数表达式：const NAME = (...) => {...}
    if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      // 向上找到 VariableStatement（含 export），用它的起点；取不到就退回当前节点起点。
      const stmt = node.parent.parent && ts.isVariableStatement(node.parent.parent)
        ? node.parent.parent
        : node.parent
      push(node.parent.name.text, stmt.getStart(sourceFile), node.end)
    }

    // function 声明（含 async / export）
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name?.text ?? "<anonymous>"
      push(name, node.getStart(sourceFile), node.end)
    }

    // 类方法
    if (ts.isMethodDeclaration(node)) {
      const name = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : "<computed>"
      push(name, node.name.getStart(sourceFile), node.end)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  void lineStarts
  return out
}

function readBaseline(): { total: number; threshold: number; generatedAt: string } | null {
  if (!existsSync(BASELINE_PATH)) return null
  try {
    const raw = readFileSync(BASELINE_PATH, "utf8")
    const parsed = JSON.parse(raw) as { total: number; threshold: number; generatedAt: string }
    if (
      typeof parsed.total === "number" &&
      typeof parsed.threshold === "number" &&
      typeof parsed.generatedAt === "string"
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = listTsFiles(SRC_ROOT)

  const all: LongFunction[] = []
  for (const file of files) {
    all.push(...collectLongFunctions(file, args.threshold))
  }

  // 稳定排序：行数降序 → 文件名 → 起始行
  all.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file) || a.startLine - b.startLine)

  if (args.writeBaseline) {
    const snapshot = {
      total: all.length,
      threshold: args.threshold,
      generatedAt: new Date().toISOString(),
    }
    writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8")
    console.log(`✅ 基线已写入 ${relative(WEB_ROOT, BASELINE_PATH)}`)
    console.log(`   阈值 >${args.threshold} 行，当前长函数总数：${all.length}`)
    return
  }

  const baseline = readBaseline()

  if (args.enforce) {
    if (!baseline) {
      console.error(
        `❌ --enforce 需要先有基线（${relative(WEB_ROOT, BASELINE_PATH)}）。请先运行 --write-baseline。`,
      )
      process.exit(1)
    }
    const delta = all.length - baseline.total
    if (delta > 0) {
      console.error(
        `❌ 长函数回归：当前 ${all.length} > 基线 ${baseline.total}（+${delta}）。拆分只能减少长函数，不能新增。`,
      )
      for (const f of all.slice(0, 20)) {
        console.error(`  ${f.file}:${f.startLine}  ${f.name}  (${f.lines} 行)`)
      }
      process.exit(1)
    }
    console.log(
      `✅ 长函数未回归：当前 ${all.length} ≤ 基线 ${baseline.total}（${delta === 0 ? "持平" : delta + " 个"}）`,
    )
    return
  }

  // 报告模式
  console.log(`\n长函数报告（阈值 >${args.threshold} 行）`)
  console.log(`扫描目录：${relative(WEB_ROOT, SRC_ROOT)}，文件数：${files.length}`)
  console.log(`长函数总数：${all.length}`)

  if (baseline) {
    const delta = all.length - baseline.total
    const sign = delta > 0 ? `+${delta}` : `${delta}`
    console.log(
      `相对基线（${baseline.total}，${baseline.generatedAt.slice(0, 10)}）：${sign}${delta < 0 ? " ✅ 下降" : delta === 0 ? " 持平" : " ⚠️ 上升"}`,
    )
  } else {
    console.log("（尚无基线；运行 --write-baseline 固化真实计数）")
  }

  // 按文件分组打印
  const byFile = new Map<string, LongFunction[]>()
  for (const f of all) {
    if (!byFile.has(f.file)) byFile.set(f.file, [])
    byFile.get(f.file)!.push(f)
  }
  const sortedFiles = [...byFile.keys()].sort(
    (a, b) => byFile.get(b)![0].lines - byFile.get(a)![0].lines,
  )

  console.log(`\n涉及文件：${sortedFiles.length}`)
  for (const file of sortedFiles) {
    const fns = byFile.get(file)!
    console.log(`\n  ${file}`)
    for (const fn of fns) {
      console.log(`    ${String(fn.startLine).padStart(5)}  ${fn.name}  (${fn.lines} 行)`)
    }
  }
}

main()
