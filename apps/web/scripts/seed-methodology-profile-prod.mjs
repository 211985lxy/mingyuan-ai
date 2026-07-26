/**
 * 线上灌入徐沪生命名方法论（用 mysql CLI，不依赖 Prisma 适配器）。
 * 用法：set -a; . /etc/mingyuan/mingyuan.env; set +a; node seed-methodology-profile-prod.mjs [compiled.md]
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { parseMysqlUrl } from "./verify-production-schema.mjs"

const SLUG = "xuhusheng-content-creation"
const FALLBACK = `借鉴这套方法与框架，不模仿作者身份和语言口吻。

【定位】走专业个人 IP 路线。人设三原则：内容型、专家型、真实型。
【账号即杂志】不同栏目各司其职。
【内容漏斗】破圈内容与转化内容分开写。
【选题】先问：这条内容替谁说话？解决什么真实问题？
【输出自检】是否破圈还是转化？有没有空话套话？`

function loadPrompt(filePath) {
  if (!filePath || !existsSync(filePath)) return FALLBACK
  const raw = readFileSync(filePath, "utf8")
  const lines = raw.split("\n")
  const sep = lines.map((l, i) => (l.trim() === "---" ? i : -1)).filter((i) => i >= 0)
  if (sep.length > 0) return lines.slice(sep[sep.length - 1] + 1).join("\n").trim() || FALLBACK
  return lines.slice(lines[0]?.startsWith("#") ? 1 : 0).join("\n").trim() || FALLBACK
}

function sqlEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")
}

function runMysql(connection, query) {
  const args = [
    "--protocol=TCP",
    "--host", connection.host,
    "--port", String(connection.port),
    "--user", connection.user,
    connection.database,
    "-N",
    "--execute",
    query,
  ]
  try {
    return execFileSync(process.env.MYSQL_BIN || "mysql", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MYSQL_PWD: connection.password },
      encoding: "utf8",
    })
  } catch (error) {
    const stderr = error.stderr?.toString?.() || error.message
    throw new Error(`mysql failed: ${stderr}`)
  }
}

function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required")
  const connection = parseMysqlUrl(process.env.DATABASE_URL)
  const fileArg = process.argv[2]
  const prompt = loadPrompt(fileArg ? resolve(fileArg) : null)
  const checksum = createHash("sha256").update(prompt, "utf8").digest("hex")
  const aliases = JSON.stringify(["徐沪生方法论", "徐沪生创作方法", "做号方法论", "《做号》方法论"])
  const agents = JSON.stringify(["content_producer"])
  const tasks = JSON.stringify(["new_copy", "rewrite_copy", "positioning_topic"])
  const empty = "[]"

  const existing = runMysql(
    connection,
    `SELECT id FROM MethodologyProfile WHERE slug='${sqlEscape(SLUG)}' LIMIT 1`,
  ).trim()

  if (existing) {
    const latest = runMysql(
      connection,
      `SELECT checksum, version FROM MethodologyProfileVersion WHERE profileId='${sqlEscape(existing)}' AND status='published' ORDER BY version DESC LIMIT 1`,
    ).trim()
    const [latestChecksum, latestVersion] = latest ? latest.split("\t") : ["", "0"]
    if (latestChecksum === checksum) {
      console.log(`[skip] 内容未变化：${SLUG} v${latestVersion}`)
      return
    }
    const next = Number(latestVersion || 0) + 1
    const versionId = `cms${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    runMysql(
      connection,
      `INSERT INTO MethodologyProfileVersion
        (id, profileId, version, contentMarkdown, compiledPrompt, sourceRefs, checksum, status, publishedAt, createdAt)
       VALUES
        ('${sqlEscape(versionId)}', '${sqlEscape(existing)}', ${next}, '${sqlEscape(prompt)}', '${sqlEscape(prompt)}', '${empty}', '${checksum}', 'published', NOW(3), NOW(3))`,
    )
    console.log(`[ok] 新建版本：${SLUG} v${next} id=${versionId}`)
    return
  }

  const profileId = `cms${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const versionId = `cms${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  runMysql(
    connection,
    `INSERT INTO MethodologyProfile
      (id, userId, name, slug, originatorName, aliases, methodologyType, scope, description, applicableAgents, applicableTasks, applicableChannels, priority, status, createdAt, updatedAt)
     VALUES
      ('${sqlEscape(profileId)}', NULL, '徐沪生创作方法论', '${SLUG}', '徐沪生', '${sqlEscape(aliases)}', 'content_creation', 'global',
       '徐沪生《做号：个人IP创作手册》内容创作方法论蒸馏。', '${sqlEscape(agents)}', '${sqlEscape(tasks)}', '${empty}',
       100, 'active', NOW(3), NOW(3))`,
  )
  runMysql(
    connection,
    `INSERT INTO MethodologyProfileVersion
      (id, profileId, version, contentMarkdown, compiledPrompt, sourceRefs, checksum, status, publishedAt, createdAt)
     VALUES
      ('${sqlEscape(versionId)}', '${sqlEscape(profileId)}', 1, '${sqlEscape(prompt)}', '${sqlEscape(prompt)}', '${empty}', '${checksum}', 'published', NOW(3), NOW(3))`,
  )
  console.log(`[ok] 已创建：徐沪生创作方法论 id=${profileId} v1=${versionId}`)
}

main()
