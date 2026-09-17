#!/usr/bin/env node
/**
 * 知识索引接线契约校验
 *
 * 把「新增知识时必须触发向量化」这条口头约定变成可执行门禁。
 *
 * 为什么需要它：
 *   `KnowledgeEntry` 是全站知识的唯一写入点，但写入入口分散在 20+ 个 route / service。
 *   「记得在写完条目后调 `ensureKnowledgeEmbedding`」这个约定无法靠 review 维持 ——
 *   漏掉一处不会有任何报错，只表现为「这条知识 AI 检索不到」。本次改造前实测已漏 2 处。
 *
 * 检查两项：
 *   1. 写入接线 —— 每个 `knowledgeEntry.create/createMany/upsert` 所在文件，
 *      必须出现索引链路标记之一（`ensureKnowledgeEmbedding` / `fireKnowledgeEmbedding` /
 *      `fireEmbedding` / `setEmbeddingHook`）。
 *   2. 块级串联 —— `src/lib/llm/embeddings.ts` 必须引用块级索引模块，
 *      否则 `KnowledgeChunk` 永远为空，P0/P1/P2 三级检索静默退化为条目级。
 *
 * 用法：
 *   node scripts/check-knowledge-indexing.mjs                              # 默认以脚本上一级为 web root
 *   node scripts/check-knowledge-indexing.mjs --root=/path/to/apps/web     # 指定 root
 *   node scripts/check-knowledge-indexing.mjs --report                     # 列出全部写入点及接线状态
 *
 * 退出码：0 = 通过，1 = 存在违规。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)))
const rootArg = process.argv.find((arg) => arg.startsWith("--root="))
const WEB_ROOT = rootArg ? resolve(rootArg.slice("--root=".length)) : resolve(SCRIPT_DIR, "..")
const REPORT = process.argv.includes("--report")

const SOURCE_ROOT = join(WEB_ROOT, "src")
const SKIP_DIRS = new Set(["generated", "node_modules", ".next", "dist", "__tests__"])

/** 写入调用点：只认 create / createMany / upsert。update 语义含「只改元数据」，另行人工判断。 */
const WRITE_CALL = /(?<![A-Za-z0-9_])knowledgeEntry\s*\.\s*(create|createMany|upsert)\s*\(/g

/**
 * 索引链路标记：文件中出现任一即视为已接线。
 *
 * 只做标识符边界匹配、不要求后跟 `(`：接线形式有两种 ——
 * 直接调用 `ensureKnowledgeEmbedding(id)`，以及作为回调引用
 * `hook ?? ensureKnowledgeEmbedding` / `setEmbeddingHook(ensureKnowledgeEmbedding)`。
 * 后者没有调用括号，若强制要求 `(` 会造成误报违规。
 */
const INDEX_MARKERS = [
  { id: "ensureKnowledgeEmbedding", re: /(?<![A-Za-z0-9_])ensureKnowledgeEmbedding(?![A-Za-z0-9_])/ },
  { id: "fireKnowledgeEmbedding", re: /(?<![A-Za-z0-9_])fireKnowledgeEmbedding(?![A-Za-z0-9_])/ },
  { id: "fireEmbedding", re: /(?<![A-Za-z0-9_])fireEmbedding(?![A-Za-z0-9_])/ },
  { id: "setEmbeddingHook", re: /(?<![A-Za-z0-9_])setEmbeddingHook(?![A-Za-z0-9_])/ },
]

/**
 * port / 适配器模式豁免：写入动作被抽象进接口，实际调用发生在注入方。
 *
 * 当前为空 —— 说明所有已知写入链路都在本文件内完成了接线。
 * 新增条目必须写明「谁负责触发索引」并给出可核对的调用方；
 * 若答不上来，说明这条链路真的漏了，应当修代码而不是加白名单。
 *
 * 形如：{ file: "src/lib/xxx-store.ts", reason: "port 模式，由 src/app/api/yyy/route.ts:NN 注入的回调触发" }
 */
const PORT_EXEMPT = []

const CHUNK_LINK_FILE = "src/lib/llm/embeddings.ts"
const CHUNK_LINK_MARKER = /knowledge-chunk-index/

function listSourceFiles(dir, files = []) {
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      listSourceFiles(path, files)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path)
    }
  }
  return files
}

/** 整行为注释：文档里写调用示例不应被当成真实写入点。 */
function isCommentLine(line) {
  const trimmed = line.trim()
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
}

function findWriteCalls(text) {
  const hits = []
  WRITE_CALL.lastIndex = 0
  let match
  while ((match = WRITE_CALL.exec(text)) !== null) {
    const before = text.slice(0, match.index)
    const lineStart = before.lastIndexOf("\n") + 1
    const lineEndRaw = text.indexOf("\n", match.index)
    const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw
    if (isCommentLine(text.slice(lineStart, lineEnd))) continue
    hits.push({ line: before.split("\n").length, kind: match[1] })
  }
  return hits
}

function detectMarkers(text) {
  return INDEX_MARKERS.filter((marker) => marker.re.test(text)).map((marker) => marker.id)
}

function main() {
  if (!existsSync(SOURCE_ROOT)) {
    console.error(`Knowledge indexing check could not run: ${relative(WEB_ROOT, SOURCE_ROOT)} not found`)
    process.exit(1)
  }

  const exemptFiles = new Map(PORT_EXEMPT.map((item) => [item.file, item.reason]))
  const violations = []
  const survey = []

  for (const path of listSourceFiles(SOURCE_ROOT)) {
    const file = relative(WEB_ROOT, path)
    const text = readFileSync(path, "utf8")
    const writes = findWriteCalls(text)
    if (writes.length === 0) continue

    const markers = detectMarkers(text)
    const exemptReason = exemptFiles.get(file)
    const linked = markers.length > 0 || Boolean(exemptReason)
    survey.push({ file, writes, markers, exemptReason, linked })

    if (!linked) {
      const lines = writes.map((w) => w.line).join(", ")
      violations.push(
        `${file}:${lines} 调用了 knowledgeEntry.${writes[0].kind} 但本文件无索引链路标记 ` +
          `（应调用 ensureKnowledgeEmbedding / fireKnowledgeEmbedding / fireEmbedding，或经 setEmbeddingHook 装配）`,
      )
    }
  }

  const chunkLinkPath = join(WEB_ROOT, CHUNK_LINK_FILE)
  const chunkLinked = existsSync(chunkLinkPath) && CHUNK_LINK_MARKER.test(readFileSync(chunkLinkPath, "utf8"))
  if (!chunkLinked) {
    violations.push(
      `${CHUNK_LINK_FILE}: 未引用 ${CHUNK_LINK_MARKER.source} —— 条目写入不会触发块级索引，` +
        `KnowledgeChunk 将保持为空，块级/混合/精排检索全部静默退化为条目级`,
    )
  }

  if (REPORT) {
    console.log(`写入点接线survey（root=${WEB_ROOT}）：`)
    for (const row of survey.sort((a, b) => a.file.localeCompare(b.file))) {
      const status = row.exemptReason ? `豁免(${row.exemptReason})` : row.linked ? `已接线[${row.markers.join(",")}]` : "★未接线"
      const at = row.writes.map((w) => `${w.line}:${w.kind}`).join(" ")
      console.log(`  ${status.padEnd(34)} ${row.file}  @${at}`)
    }
    console.log(`  块级串联 ${CHUNK_LINK_FILE}: ${chunkLinked ? "已接" : "★未接"}`)
    console.log("")
  }

  if (violations.length > 0) {
    console.error("Knowledge indexing contract failed:")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  console.log(`knowledge-indexing-ok writes=${survey.length} linked=${survey.filter((r) => r.linked).length} chunkLink=on`)
}

main()
