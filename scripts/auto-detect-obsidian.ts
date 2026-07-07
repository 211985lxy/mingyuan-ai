import fs from "fs"
import path from "path"

const OBSIDIAN_JSON_PATH = "/Users/xiangyu/Library/Application Support/obsidian/obsidian.json"
const CONFIG_FILE = path.join(process.cwd(), ".obsidian-sync.json")

interface ObsidianVault {
  path: string
  ts: number
  open?: boolean
}

interface ObsidianConfig {
  vaults: Record<string, ObsidianVault>
}

async function main() {
  console.log("🔍 正在为您自动检测本地 Obsidian 库路径...")
  
  if (!fs.existsSync(OBSIDIAN_JSON_PATH)) {
    console.error("❌ 错误: 未能在默认路径找到 Obsidian 配置文件:", OBSIDIAN_JSON_PATH)
    console.log("💡 请手动在 mingyuan/.obsidian-sync.json 中配置 \"obsidianVaultPath\" 为您的 Obsidian 库物理绝对路径。")
    process.exit(1)
  }

  try {
    const rawData = fs.readFileSync(OBSIDIAN_JSON_PATH, "utf-8")
    const obsidianData = JSON.parse(rawData) as ObsidianConfig
    
    if (!obsidianData.vaults || Object.keys(obsidianData.vaults).length === 0) {
      console.error("❌ 错误: 您的 Obsidian 配置文件中没有记录任何库 (vaults)。")
      process.exit(1)
    }

    const vaults = Object.values(obsidianData.vaults)
    // 按照时间戳 (ts) 降序排序，获取最近打开或使用的库
    vaults.sort((a, b) => b.ts - a.ts)
    
    console.log("\n📂 检测到以下本地 Obsidian 库:")
    vaults.forEach((v, index) => {
      console.log(`   [${index + 1}] ${path.basename(v.path)} -> ${v.path} ${v.open ? "(当前打开)" : ""}`)
    })

    // 选择最近打开或第一个库作为目标库
    const targetVault = vaults[0]
    console.log(`\n🎯 自动选择最近使用的库: "${path.basename(targetVault.path)}"`)
    console.log(`   绝对路径: ${targetVault.path}`)

    // 读取并更新 mingyuan/.obsidian-sync.json
    let configData: Record<string, any> = {}
    if (fs.existsSync(CONFIG_FILE)) {
      configData = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"))
    }
    
    configData.obsidianVaultPath = targetVault.path
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2), "utf-8")
    console.log(`\n✅ 成功将本地物理库路径配置写入: [${CONFIG_FILE}]`)
    console.log(`   "obsidianVaultPath": "${targetVault.path}"`)
    console.log("\n💡 接下来您可以直接运行增量同步命令了：\n   pnpm tsx scripts/obsidian-sync.ts")
  } catch (error) {
    console.error("❌ 自动配置失败，发生错误:", (error as Error).message)
    process.exit(1)
  }
}

main()
