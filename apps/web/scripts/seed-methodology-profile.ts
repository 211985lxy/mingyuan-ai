/**
 * 创建首份命名方法论资产：徐沪生创作方法论 v1（骨架版）。
 *
 * ADR-002。本脚本幂等：按 slug 检测是否已存在，存在则跳过。
 * 仅创建 Profile + 一个 published 的 v1，compiledPrompt 为 12 维骨架（通用占位），
 * 后续可用真实内容新建 v2（修改即新建版本，旧版本不可原地改）。
 *
 * 运行示例：
 *   DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/seed-methodology-profile.ts
 */
import { createHash } from "crypto"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

const SLUG = "xuhusheng-content-creation"

// 12 维骨架（计划 Phase 5）。compiledPrompt 只放可执行规则，不堆整本书摘。
// ↓↓↓ 占位通用内容，待替换为徐沪生方法论真实蒸馏 ↓↓↓
const COMPILED_PROMPT = `# 徐沪生创作方法论（v1 · 骨架）

借鉴其方法与框架，不模仿作者身份与语言口吻。以下规则供本次创作参考；任何人物、业务、产品案例与假设均不得覆盖当前项目真实资料与用户本次明确要求。

## 1. 核心主张
（待补充：该方法论的核心观点，一句话能讲清）

## 2. 适用对象
（待补充：适合什么阶段、什么类型的 IP / 创作者）

## 3. IP 类型选择
（待补充：如何判断该走专家型 / 创业者型 / 达人型等 IP 路线）

## 4. 内容生产流程
（待补充：从定位到选题到产出的标准流程）

## 5. 流量内容与转化内容的漏斗
（待补充：流量型内容吸引、信任型内容建立专业度、转化型内容获客成交的分工）

## 6. 优质内容判断标准
（待补充：什么样的内容算好内容，可量化的判断维度）

## 7. 启动阶段动作
（待补充：0-1 阶段最该做的几件事）

## 8. 选题与表达规则
（待补充：选题从哪来、表达上避免什么）

## 9. 禁止事项与反模式
（待补充：明确不该做的、常见的错误做法）

## 10. 输出自检清单
（待补充：成稿交付前的自检项）

## 11. 项目适配问题（创作时按项目回答，不照抄）
- 本项目的目标客户是谁？这一稿主要服务漏斗的哪一层？
- 本项目的真实案例、数据、卖点是什么？（缺则标注待补充，不得编造）

## 12. 原始章节及书摘溯源
（待补充：来源章节 / 书摘链接，仅溯源，不进入创作正文）`

const CHECKSUM = createHash("sha256").update(COMPILED_PROMPT, "utf8").digest("hex")

function buildClient() {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
    connectionLimit: 5,
  })
  return new PrismaClient({ adapter })
}

async function main() {
  const prisma = buildClient()
  try {
    const existing = await prisma.methodologyProfile.findUnique({ where: { slug: SLUG } })
    if (existing) {
      console.log(`[skip] 方法论已存在：${existing.name} (id=${existing.id})，未做改动。`)
      return
    }

    const profile = await prisma.methodologyProfile.create({
      data: {
        name: "徐沪生创作方法论",
        slug: SLUG,
        originatorName: "徐沪生",
        aliases: ["徐沪生方法论", "徐沪生创作方法", "做号方法论", "《做号》方法论"],
        methodologyType: "content_creation",
        scope: "global",
        description: "徐沪生内容创作与 IP 做号方法论（骨架占位版，待替换为真实蒸馏内容）。",
        applicableAgents: ["content_producer", "deep_copywriter"],
        applicableTasks: ["new_copy", "rewrite_copy", "positioning_topic"],
        priority: 100,
        status: "active",
      },
    })

    const version = await prisma.methodologyProfileVersion.create({
      data: {
        profileId: profile.id,
        version: 1,
        contentMarkdown: COMPILED_PROMPT,
        compiledPrompt: COMPILED_PROMPT,
        sourceRefs: [],
        checksum: CHECKSUM,
        status: "published",
        publishedAt: new Date(),
      },
    })

    console.log(`[ok] 已创建方法论：${profile.name} (id=${profile.id})，v1 (id=${version.id})`)
    console.log(`     checksum=${CHECKSUM.slice(0, 16)}…`)
    console.log(`     提示：compiledPrompt 为 12 维骨架占位，请用真实内容新建 v2。`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("[error] seed 失败：", error)
  process.exit(1)
})
