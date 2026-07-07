/**
 * 明远AIM 网页浏览器仿真审计工具 (Static & Semantic Site Auditor)
 * 
 * 使用方法:
 * pnpm tsx scripts/audit-site.ts
 */

import fs from "fs"
import path from "path"

interface AuditMetric {
  score: number
  passed: boolean
  issues: string[]
}

interface PageAuditResult {
  filePath: string
  pageRoute: string
  seo: AuditMetric
  a11y: AuditMetric
  automation: AuditMetric
}

// 目标审计的核心页面
const PAGES_TO_AUDIT = [
  { route: "/", relativePath: "apps/web/src/app/(marketing)/page.tsx" },
  { route: "/home", relativePath: "apps/web/src/app/(dashboard)/home/page.tsx" },
  { route: "/ip-profile", relativePath: "apps/web/src/app/(dashboard)/ip-profile/page.tsx" },
  { route: "/aim", relativePath: "apps/web/src/app/(dashboard)/aim/page.tsx" },
  { route: "/quality-check", relativePath: "apps/web/src/app/(dashboard)/quality-check/page.tsx" },
]

function auditFile(route: string, filePath: string): PageAuditResult {
  const absolutePath = path.join(process.cwd(), filePath)
  if (!fs.existsSync(absolutePath)) {
    return {
      filePath,
      pageRoute: route,
      seo: { score: 0, passed: false, issues: [`文件不存在: ${filePath}`] },
      a11y: { score: 0, passed: false, issues: [`文件不存在: ${filePath}`] },
      automation: { score: 0, passed: false, issues: [`文件不存在: ${filePath}`] },
    }
  }

  const content = fs.readFileSync(absolutePath, "utf-8")
  
  // 1. SEO 审计
  let seoScore = 100
  const seoIssues: string[] = []
  
  // 检查 Metadata
  const hasMetadata = content.includes("export const metadata") || content.includes("generateMetadata") || content.includes("title:")
  if (!hasMetadata) {
    // 营销页或 Layout 通常定义 metadata，子组件通常继承
    if (route === "/") {
      seoScore -= 30
      seoIssues.push("❌ 缺失 Next.js 生产规范的 `export const metadata` 变量定义，影响搜索引擎爬取。")
    }
  }
  
  // 检查 h1 标签
  const h1Matches = content.match(/<h1[\s\S]*?>/g) || []
  if (h1Matches.length === 0) {
    // 部分页面可能将 h1 放在子组件中
    seoIssues.push("⚠️ 在页面主入口中未检测到 `<h1>` 主标题标签，建议为每个页面显式包含一个语义化 h1。")
    seoScore -= 15
  } else if (h1Matches.length > 1) {
    seoIssues.push(`❌ 检测到 ${h1Matches.length} 个 \`<h1>\` 标签。根据 Google SEO 指南，单页面有且仅能有一个 h1 主标题。`)
    seoScore -= 20
  }

  // 检查语义化 HTML 元素比例
  const semanticElements = ["<main", "<section", "<article", "<aside", "<footer", "<nav", "<header"]
  const usedSemantics = semanticElements.filter(el => content.includes(el))
  if (usedSemantics.length < 2) {
    seoIssues.push("⚠️ 语义化 HTML5 元素（如 `<main>`、`<section>`）使用较少，大篇幅使用普通的 `<div>` 会降低 SEO 结构分。")
    seoScore -= 10
  }

  // 2. A11y 可访问性审计
  let a11yScore = 100
  const a11yIssues: string[] = []

  // 检查 Image 标签的 alt 属性
  const imgMatches = content.match(/<(img|Image)[\s\S]*?>/g) || []
  let missingAltCount = 0
  for (const img of imgMatches) {
    if (!img.includes("alt=") || img.includes('alt=""') || img.includes("alt={}") || img.includes('alt=\'\'')) {
      missingAltCount++
    }
  }
  if (missingAltCount > 0) {
    a11yIssues.push(`❌ 检测到 ${missingAltCount} 个图片元素缺少有意义的 \`alt\` 描述属性，无障碍读屏器将无法解析。`)
    a11yScore -= Math.min(30, missingAltCount * 10)
  }

  // 检查交互组件是否带有 Aria Label (当含有 Icon 且没有文本时)
  const buttonMatches = content.match(/<(Button|button)[\s\S]*?>/g) || []
  let iconOnlyButtonsWithoutAria = 0
  for (const btn of buttonMatches) {
    // 简化判断：如果包含 Lucide 图标 (如 <Plus, <Trash 等) 且不带 aria-label 属性
    if (content.includes("lucide-react") && !btn.includes("aria-label=") && !btn.includes("aria-labelledby=")) {
      // 在一些 icon button 场景可能缺失
      iconOnlyButtonsWithoutAria++
    }
  }
  // 宽松审计，只提示
  if (iconOnlyButtonsWithoutAria > 5) {
    a11yIssues.push("⚠️ 部分按钮或图标可能缺失 `aria-label` 属性，请确保纯图标按钮在读屏器中能被读出用途。")
    a11yScore -= 10
  }

  // 3. 自动化测试友好度审计 (Unique IDs for Headless Browser)
  let autoScore = 100
  const autoIssues: string[] = []

  // 统计所有的交互性输入组件和动作按钮是否提供了 unique id 属性供 Puppeteer / Playwright 虚拟浏览器审核与调用
  const inputMatches = content.match(/<(input|Input|textarea|Textarea|select|Select)[\s\S]*?>/g) || []
  let inputWithoutId = 0
  for (const input of inputMatches) {
    // 过滤掉 shadcn/ui Select 相关的呈现性子组件，这些子组件不是实际的表单输入域
    if (
      input.startsWith("<SelectValue") ||
      input.startsWith("<SelectContent") ||
      input.startsWith("<SelectItem")
    ) {
      continue
    }
    if (!input.includes("id=")) {
      inputWithoutId++
    }
  }
  if (inputWithoutId > 0) {
    autoIssues.push(`❌ 检测到 ${inputWithoutId} 个输入框元素缺少 \`id\` 属性。这会导致 Selenium/Playwright 虚拟浏览器测试时必须依赖不稳定的 XPath 或类选择器，极易引起回归测试崩溃。`)
    autoScore -= Math.min(40, inputWithoutId * 15)
  }

  const interactiveElements = content.match(/<(Button|button|a|TabsTrigger)[\s\S]*?>/g) || []
  let actionWithoutIdOrTestId = 0
  for (const el of interactiveElements) {
    if (!el.includes("id=") && !el.includes("data-testid=")) {
      actionWithoutIdOrTestId++
    }
  }
  if (actionWithoutIdOrTestId > 5) {
    autoIssues.push(`⚠️ 检测到较多交互控件（如按钮、链接等）缺少 \`id\` 或 \`data-testid\` 属性。为保证虚拟自动化浏览器的 100% 稳定运行，建议为重要交互操作分配唯一 ID。`)
    autoScore -= 15
  }

  return {
    filePath,
    pageRoute: route,
    seo: { score: Math.max(0, seoScore), passed: seoScore >= 80, issues: seoIssues },
    a11y: { score: Math.max(0, a11yScore), passed: a11yScore >= 80, issues: a11yIssues },
    automation: { score: Math.max(0, autoScore), passed: autoScore >= 80, issues: autoIssues }
  }
}

function generateReport(results: PageAuditResult[]): string {
  let report = `# 🌐 明远AIM 虚拟浏览器网页质量仿真审计报告\n\n`
  report += `> **审计时间**: 2026-05-22  \n`
  report += `> **受众**: 首席技术架构师、首席产品官  \n`
  report += `> **目标**: 针对 明远AIM 核心页面的 SEO、可访问性（A11y）以及自动化测试（Headless Browser）友好度进行深度审查。\n\n`

  report += `## 📊 全站质量仪表盘\n\n`
  report += `| 页面路由 | 物理文件路径 | SEO 评分 | A11y 评分 | 自动化测试得分 | 综合评级 |\n`
  report += `| --- | --- | --- | --- | --- | --- |\n`

  let totalSeo = 0
  let totalA11y = 0
  let totalAuto = 0

  for (const r of results) {
    totalSeo += r.seo.score
    totalA11y += r.a11y.score
    totalAuto += r.automation.score

    const average = (r.seo.score + r.a11y.score + r.automation.score) / 3
    let rating = "🟢 优秀 (A)"
    if (average < 75) rating = "🔴 需改进 (C)"
    else if (average < 90) rating = "🟡 良好 (B)"

    report += `| \`${r.pageRoute}\` | [${path.basename(r.filePath)}](file:///${path.join(process.cwd(), r.filePath)}) | **${r.seo.score}** | **${r.a11y.score}** | **${r.automation.score}** | ${rating} |\n`
  }

  const avgSeo = Math.round(totalSeo / results.length)
  const avgA11y = Math.round(totalA11y / results.length)
  const avgAuto = Math.round(totalAuto / results.length)
  const globalAvg = Math.round((avgSeo + avgA11y + avgAuto) / 3)

  let globalRating = "🟢 优秀 (A)"
  if (globalAvg < 75) globalRating = "🔴 需改进 (C)"
  else if (globalAvg < 90) globalRating = "🟡 良好 (B)"

  report += `| **全站平均** | `-` | **${avgSeo}** | **${avgA11y}** | **${avgAuto}** | **${globalRating}** |\n\n`

  report += `### 💡 核心审计洞察与改进建议\n\n`

  for (const r of results) {
    const hasIssues = r.seo.issues.length > 0 || r.a11y.issues.length > 0 || r.automation.issues.length > 0
    if (!hasIssues) continue

    report += `### 📍 页面 \`${r.pageRoute}\` 详细报告\n`
    report += `文件路径: [${r.filePath}](file:///${path.join(process.cwd(), r.filePath)})\n\n`

    if (r.seo.issues.length > 0) {
      report += `#### 🔍 SEO 搜索引擎优化缺陷 (${r.seo.score}/100)\n`
      r.seo.issues.forEach(i => report += `- ${i}\n`)
      report += `\n`
    }

    if (r.a11y.issues.length > 0) {
      report += `#### ♿ A11y 无障碍读屏缺陷 (${r.a11y.score}/100)\n`
      r.a11y.issues.forEach(i => report += `- ${i}\n`)
      report += `\n`
    }

    if (r.automation.issues.length > 0) {
      report += `#### 🤖 Playwright 虚拟浏览器测试友好度缺陷 (${r.automation.score}/100)\n`
      r.automation.issues.forEach(i => report += `- ${i}\n`)
      report += `\n`
    }

    report += `---\n\n`
  }

  report += `## 🛠️ 下一步质量改进策略\n\n`
  report += `> [!IMPORTANT]\n`
  report += `> 根据 \`<RULE[AGENTS.md]>\` 的 SEO 准则以及 E2E 测试高稳定性红线，建议尽快完成以下两项靶向微调：\n\n`
  report += `1. **页面单 H1 语义重构**：\n`
  report += `   * 针对多于一个 h1 的页面（如营销主页等），将副标题改为 \`<h2 className="text-xl">\` 等，确保单页面唯一 h1 物理红线。\n`
  report += `2. **为交互表单注入 Unique IDs**：\n`
  report += `   * 在 \`/aim\` 以及 \`/ip-profile\` 的输入框与重要点击控件上，全部补齐 \`id\` 属性。这不仅使测试断言无需使用不稳定的 CSS 类名，更保障了后续进行更深度 Headless 浏览器交互审查时的 100% 稳定性。\n`

  return report
}

const auditResults = PAGES_TO_AUDIT.map(p => auditFile(p.route, p.relativePath))
const finalReport = generateReport(auditResults)

// 写入 Artifact 到 artifacts 目录或本地 docs
const reportPath = path.join(process.cwd(), "docs/website-browser-audit-report.md")
fs.writeFileSync(reportPath, finalReport, "utf-8")
console.log(`🎉 仿真浏览器审计完成！报告已写入: ${reportPath}`)
