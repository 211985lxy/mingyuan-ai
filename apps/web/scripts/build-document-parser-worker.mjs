#!/usr/bin/env node
// 构建期把受限文档解析 worker 打包为零依赖单文件 .mjs，
// 随 standalone 产物部署（生产服务器没有 tsx，.ts 源码也无法直接 fork）。
// 用法：node scripts/build-document-parser-worker.mjs [--out <path>]
import { createRequire } from "node:module"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, "..")

// esbuild 是 vite 的传递依赖（pnpm 结构下不在 apps/web 直接依赖里），逐级向上解析；
// 顶层找不到时直接扫 node_modules/.pnpm store（worktree 等场景）
function resolveEsbuild() {
  let dir = webDir
  while (true) {
    try {
      return createRequire(join(dir, "package.json"))("esbuild")
    } catch {
      const pnpmStore = join(dir, "node_modules", ".pnpm")
      if (existsSync(pnpmStore)) {
        const entries = readdirSync(pnpmStore)
          .filter((entry) => entry.startsWith("esbuild@"))
          .sort()
        if (entries.length > 0) {
          return createRequire(
            join(pnpmStore, entries.at(-1), "node_modules", "esbuild", "package.json"),
          )("esbuild")
        }
      }
      const parent = dirname(dir)
      if (parent === dir) throw new Error("esbuild 不存在：请先安装依赖（pnpm install）")
      dir = parent
    }
  }
}

const args = process.argv.slice(2)
const outIndex = args.indexOf("--out")
const outfile = outIndex !== -1
  ? resolve(args[outIndex + 1])
  : join(webDir, ".next", "standalone", "apps", "web", "document-parser-worker.mjs")

const esbuild = resolveEsbuild()
await esbuild.build({
  entryPoints: [join(webDir, "src", "lib", "document-parser-worker.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  legalComments: "none",
  logLevel: "warning",
})

if (!existsSync(outfile)) throw new Error(`worker 打包失败：${outfile} 未生成`)
console.log(`document-parser-worker 打包完成 → ${outfile}`)
