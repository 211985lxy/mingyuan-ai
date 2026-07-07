/**
 * 明远AIM Obsidian 本地双脑增量同步 CLI 工具
 * 
 * 使用方法:
 * pnpm tsx scripts/obsidian-sync.ts [--force] [--config path]
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"

// 全局临时关闭 Obsidian Local REST API 自签名 HTTPS 证书的拦截校验
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

// ─── 配置定义与加载 ──────────────────────────────────────────

interface SyncConfig {
  obsidianApiUrl: string   // 默认 https://127.0.0.1:27124
  obsidianToken: string    // Obsidian Local REST API Token
  targetServerUrl: string  // 明远AIM 服务地址，默认 http://localhost:3000
  syncToken: string        // 知识库同步验证令牌
  syncTag: string          // 只同步包含此 Tag 的笔记，默认 #Aim/知识库
  userId?: string          // 可选，绑定至指定用户 ID
  obsidianVaultPath: string // 本地 Obsidian Vault 物理库绝对路径，例如: /Users/xiangyu/Documents/Vault
  exportDir: string         // 生成文案保存的子文件夹，默认: MingyuanGenerated
}

interface FileState {
  filePath: string
  mtime: number
  hash: string
}

interface SyncState {
  lastSyncTime: number
  files: Record<string, FileState>
}

const DEFAULT_CONFIG: SyncConfig = {
  obsidianApiUrl: "https://127.0.0.1:27124",
  obsidianToken: "",
  targetServerUrl: "http://localhost:3000",
  syncToken: "mingyuan-obsidian-sync-secret",
  syncTag: "Aim/知识库", // Frontmatter 标签不含 #，正文可带 #
  obsidianVaultPath: "", // 默认为空，启用本地物理扫描时在此处配置绝对路径
  exportDir: "MingyuanGenerated",
}

const CONFIG_FILE = path.join(process.cwd(), ".obsidian-sync.json")
const STATE_FILE = path.join(process.cwd(), ".obsidian-sync-state.json")

function loadConfig(): SyncConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const fileData = fs.readFileSync(CONFIG_FILE, "utf-8")
      const parsed = JSON.parse(fileData)
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch (e) {
      console.warn("读取配置文件 .obsidian-sync.json 失败，将使用默认配置:", (e as Error).message)
    }
  } else {
    // 首次运行，自动创建一份示例配置
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8")
      console.log(`已在项目根目录下生成默认配置文件: [${CONFIG_FILE}]，请在其中填入你的 Obsidian Local REST API Token。`)
    } catch (e) {
      // ignore
    }
  }
  return DEFAULT_CONFIG
}

// 递归扫描本地文件夹中的 .md 笔记
function scanLocalVault(dir: string, baseDir: string = dir): string[] {
  let results: string[] = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir)
  for (const file of list) {
    // 忽略隐藏文件（以 . 开头的）和 node_modules
    if (file.startsWith(".") || file === "node_modules") continue
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      results = results.concat(scanLocalVault(filePath, baseDir))
    } else if (file.endsWith(".md")) {
      // 算出相对于 Vault 根目录的相对路径，格式统一为 Unix 风格（斜杠 /）
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, "/")
      results.push(relativePath)
    }
  }
  return results
}


function loadState(): SyncState {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const fileData = fs.readFileSync(STATE_FILE, "utf-8")
      return JSON.parse(fileData) as SyncState
    } catch {
      // ignore
    }
  }
  return { lastSyncTime: 0, files: {} }
}

function saveState(state: SyncState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8")
  } catch (e) {
    console.error("保存同步状态失败:", (e as Error).message)
  }
}

// ─── 辅助解析函数 ──────────────────────────────────────────

// 解析 Markdown Frontmatter YAML
function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, any>
  content: string
} {
  const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  const match = markdown.match(yamlRegex)

  if (!match) {
    return { frontmatter: {}, content: markdown }
  }

  const yamlBlock = match[1]
  const content = match[2]
  const frontmatter: Record<string, any> = {}

  // 极简 YAML 解析行
  const lines = yamlBlock.split(/\r?\n/)
  for (const line of lines) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.substring(0, colonIndex).trim()
    let valStr = line.substring(colonIndex + 1).trim()

    // 剥离引号
    if (valStr.startsWith('"') && valStr.endsWith('"')) {
      valStr = valStr.substring(1, valStr.length - 1)
    } else if (valStr.startsWith("'") && valStr.endsWith("'")) {
      valStr = valStr.substring(1, valStr.length - 1)
    }

    // 解析数组格式 [tag1, tag2]
    if (valStr.startsWith("[") && valStr.endsWith("]")) {
      try {
        const cleaned = valStr
          .substring(1, valStr.length - 1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        frontmatter[key] = cleaned
        continue
      } catch {
        // fallback
      }
    }

    frontmatter[key] = valStr
  }

  return { frontmatter, content }
}

// 清洗 Obsidian 双链 [[Note]]
function cleanObsidianDoubleLinks(text: string): string {
  // 将 [[链接|别名]] 替换为 别名
  let cleaned = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
  // 将 [[链接]] 替换为 链接
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, "$1")
  return cleaned
}

// 校验内容中或 frontmatter 中是否包含目标同步 Tag
function containsSyncTag(
  markdown: string,
  frontmatter: Record<string, any>,
  targetTag: string
): boolean {
  // 1. 在 Frontmatter 的 tags 里寻找
  if (Array.isArray(frontmatter.tags)) {
    if (frontmatter.tags.some((t: string) => t.toLowerCase() === targetTag.toLowerCase())) {
      return true
    }
  }
  if (typeof frontmatter.tag === "string" && frontmatter.tag.toLowerCase() === targetTag.toLowerCase()) {
    return true
  }

  // 2. 在正文中全文检索，包含带 # 的情况，例如 #Aim/知识库
  const hashTag = targetTag.startsWith("#") ? targetTag : `#${targetTag}`
  return markdown.includes(hashTag) || markdown.includes(targetTag)
}

// ─── Obsidian Local REST API 交互 ──────────────────────────

async function getFilesList(apiUrl: string, token: string): Promise<{ path: string }[]> {
  const res = await fetch(`${apiUrl}/vault/`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  })

  if (!res.ok) {
    throw new Error(`获取文件树失败: HTTP ${res.status}`)
  }

  const data = (await res.json()) as { files: string[] }
  // 只过滤 Markdown 笔记
  return (data.files || []).filter((f) => f.endsWith(".md")).map((f) => ({ path: f }))
}

interface FileMetadata {
  mtime: number
  ctime: number
  size: number
}

async function getFileMetadata(apiUrl: string, token: string, filePath: string): Promise<FileMetadata> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/")
  const res = await fetch(`${apiUrl}/vault/${encodedPath}`, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`获取文件元数据失败: HTTP ${res.status}`)
  }

  const mtime = parseInt(res.headers.get("last-modified-mtime") || "0", 10)
  return {
    mtime: mtime || Date.now(),
    ctime: Date.now(),
    size: parseInt(res.headers.get("content-length") || "0", 10),
  }
}

async function getFileContent(apiUrl: string, token: string, filePath: string): Promise<string> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/")
  const res = await fetch(`${apiUrl}/vault/${encodedPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/markdown",
    },
  })

  if (!res.ok) {
    throw new Error(`获取文件内容失败: HTTP ${res.status}`)
  }

  return res.text()
}

// ─── 主程序 ────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes("--force")
  const config = loadConfig()

  const isPhysicalMode = config.obsidianVaultPath && fs.existsSync(config.obsidianVaultPath)

  if (!isPhysicalMode && !config.obsidianToken) {
    console.error("❌ 错误: 未在 .obsidian-sync.json 配置文件中检测到 obsidianToken 或有效的 obsidianVaultPath。")
    console.error("请配置有效的 obsidianVaultPath 以使用物理直读模式，或者安装 Obsidian Local REST API 插件并配置 Token。")
    process.exit(1)
  }

  console.log("⚙️  正在初始化 Obsidian CLI 本地知识同步程序...")
  console.log(`   - 目标云端: ${config.targetServerUrl}`)
  console.log(`   - 筛选标签: #${config.syncTag}`)
  if (isPhysicalMode) {
    console.log(`   - 模式: 🟢 物理磁盘直连模式`)
    console.log(`   - 绝对路径: ${config.obsidianVaultPath}`)
  } else {
    console.log(`   - 模式: 🌐 Local REST API 模式`)
  }

  const state = force ? { lastSyncTime: 0, files: {} } : loadState()
  let allFiles: { path: string }[] = []

  if (isPhysicalMode) {
    try {
      allFiles = scanLocalVault(config.obsidianVaultPath).map((p) => ({ path: p }))
    } catch (e) {
      console.error("❌ 错误: 递归扫描本地 Vault 文件夹失败。")
      console.error("   详情:", (e as Error).message)
      process.exit(1)
    }
  } else {
    try {
      allFiles = await getFilesList(config.obsidianApiUrl, config.obsidianToken)
    } catch (e) {
      console.error("❌ 错误: 无法连接本地 Obsidian REST 服务，请确保 Obsidian 处于打开状态且已启用插件。")
      console.error("   详情:", (e as Error).message)
      process.exit(1)
    }
  }

  console.log(`📂 在本地 Vault 中共扫描到 ${allFiles.length} 个 Markdown 笔记。`)

  const uploadQueue: any[] = []
  const newFilesState: Record<string, FileState> = {}

  let totalScanned = 0
  let matchedCount = 0

  for (const file of allFiles) {
    totalScanned++
    const filePath = file.path
    const baseName = path.basename(filePath, ".md")

    try {
      // 1. 获取元数据，用于增量校验
      let meta: FileMetadata

      if (isPhysicalMode) {
        const absoluteFilePath = path.join(config.obsidianVaultPath, filePath)
        const stat = fs.statSync(absoluteFilePath)
        const mtime = Math.round(stat.mtimeMs || stat.mtime.getTime())
        meta = {
          mtime,
          ctime: Math.round(stat.birthtimeMs || stat.birthtime.getTime()),
          size: stat.size
        }
      } else {
        meta = await getFileMetadata(config.obsidianApiUrl, config.obsidianToken, filePath)
      }

      const prevState = state.files[filePath]

      // 如果修改时间未变且处于增量模式，则跳过获取正文以极速提效
      if (prevState && prevState.mtime === meta.mtime && !force) {
        newFilesState[filePath] = prevState
        continue
      }

      // 2. 读取文件内容
      let rawMarkdown: string
      if (isPhysicalMode) {
        const absoluteFilePath = path.join(config.obsidianVaultPath, filePath)
        rawMarkdown = fs.readFileSync(absoluteFilePath, "utf-8")
      } else {
        rawMarkdown = await getFileContent(config.obsidianApiUrl, config.obsidianToken, filePath)
      }
      const { frontmatter, content } = parseFrontmatter(rawMarkdown)

      // 3. 判断是否需要同步
      if (!containsSyncTag(rawMarkdown, frontmatter, config.syncTag)) {
        continue
      }

      matchedCount++

      // 4. 解析分类映射
      // boss_experience | product_usp | customer_pain | project_case | customer_qa
      let category = frontmatter.category || "boss_experience"
      const allowedCategories = ["boss_experience", "product_usp", "customer_pain", "project_case", "customer_qa"]
      if (!allowedCategories.includes(category)) {
        category = "boss_experience"
      }

      // 5. 对内容进行智能清洗 (剥离双链)
      const cleanedContent = cleanObsidianDoubleLinks(content.trim())

      // 6. 生成唯一性的幂等 ID (采用 filePath 哈希作为后缀，如 obsidian_xxxx)
      const pathHash = crypto.createHash("md5").update(filePath).digest("hex").substring(0, 16)
      const uniqueId = `obsidian_${pathHash}`

      // 获取当前内容的哈希，防止内容无实质变更
      const contentHash = crypto.createHash("md5").update(cleanedContent).digest("hex")

      if (prevState && prevState.hash === contentHash && !force) {
        // 内容虽然更新时间变了，但内容没变，也跳过
        newFilesState[filePath] = {
          filePath,
          mtime: meta.mtime,
          hash: contentHash,
        }
        continue
      }

      // 7. 准备同步入库数据
      // 提取标签 (除筛选标记之外的标签)
      const tags: string[] = Array.isArray(frontmatter.tags) ? frontmatter.tags : []
      if (typeof frontmatter.tag === "string") tags.push(frontmatter.tag)
      
      uploadQueue.push({
        id: uniqueId,
        title: frontmatter.title || baseName,
        content: cleanedContent,
        category,
        tags: tags.filter((t) => t.toLowerCase() !== config.syncTag.toLowerCase()),
      })

      newFilesState[filePath] = {
        filePath,
        mtime: meta.mtime,
        hash: contentHash,
      }
    } catch (error) {
      console.warn(`⚠️ 无法解析或同步笔记 [${filePath}]:`, (error as Error).message)
    }
  }

  console.log(`🔍 扫描完毕，打标包含 #${config.syncTag} 的笔记共 ${matchedCount} 个。`)

  if (uploadQueue.length === 0) {
    console.log("✅ 没有检测到任何有变更的知识笔记，本次同步无需推流。")
    // 更新本地状态文件
    saveState({
      lastSyncTime: Date.now(),
      files: { ...state.files, ...newFilesState },
    })
    return
  }

  console.log(`🚀 检测到有 ${uploadQueue.length} 个知识笔记发生更新，准备推流至 明远AIM 智能体云端...`)

  try {
    const serverUrl = `${config.targetServerUrl}/api/knowledge/sync`
    const payload = {
      entries: uploadQueue,
      userId: config.userId,
    }

    const res = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-obsidian-token": config.syncToken,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}))
      throw new Error(errorJson.error || `HTTP ${res.status}`)
    }

    const resJson = await res.json()
    console.log(`🎉 同步成功！成功将 ${resJson.syncedCount} 条增量知识注入 明远AIM 企业大脑。`)
    
    // 更新同步成功的状态
    saveState({
      lastSyncTime: Date.now(),
      files: { ...state.files, ...newFilesState },
    })
  } catch (error) {
    console.error("❌ 错误: 云端同步网络请求失败，请检查 明远AIM 服务是否已启动。")
    console.error("   详情:", (error as Error).message)
  }
}

main().catch((e) => {
  console.error("程序遭遇致命崩溃:", e)
})
