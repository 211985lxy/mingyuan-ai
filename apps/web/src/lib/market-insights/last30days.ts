import { env, getProcessEnvironment } from "@/env"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"
import { logger } from "@/lib/logger"

export interface Last30DaysItem {
  id: string;
  platform: string;
  title: string;
  excerpt: string;
  url: string;
  author: string;
  date: string;
  score: number;
  engagement?: any;
}

export interface Last30DaysResult {
  topic: string;
  dateRange: { from: string; to: string };
  sources: string[];
  items: Last30DaysItem[];
  warnings: string[];
  summary: string;
}

/**
 * 运行近30天市场讨论检索服务
 * @param topic 检索主题关键词
 * @param requestedSources 指定检索的平台数据源，选填
 */
export async function runLast30DaysResearch(
  topic: string,
  requestedSources?: string[]
): Promise<Last30DaysResult> {
  const enabled = env.LAST30DAYS_CN_ENABLED === "true"
  const skillDir = env.LAST30DAYS_CN_SKILL_DIR || ""
  const configDir = env.LAST30DAYS_CN_CONFIG_DIR || ""
  const timeoutMs = parseInt(env.LAST30DAYS_CN_TIMEOUT_MS || "120000", 10)

  // 1. 验证启用状态
  if (!enabled) {
    throw new Error("近30天市场讨论暂未启用")
  }

  // 2. 验证 Skill 目录
  if (!skillDir || !fs.existsSync(skillDir)) {
    logger.error(`last30days-cn skill directory not found: ${skillDir}`)
    throw new Error("近30天市场讨论脚本路径未配置或不存在")
  }

  const scriptPath = path.join(skillDir, "scripts", "last30days.py")
  if (!fs.existsSync(scriptPath)) {
    logger.error(`last30days-cn script file not found at: ${scriptPath}`)
    throw new Error("近30天市场讨论脚本未找到")
  }

  // 3. 检测配置文件是否存在（做警告日志，但允许继续）
  const envFile = path.join(configDir, ".env")
  if (!configDir || !fs.existsSync(envFile)) {
    logger.warn(`last30days-cn config file not found at: ${envFile}. Running with limited sources.`)
  }

  // 4. 构建参数列表
  const args = [
    scriptPath,
    topic,
    "--emit", "json",
    "--quick",
    "--days", "30"
  ]

  // 如果传入了有效的 sources，则添加 --search 参数
  if (requestedSources && requestedSources.length > 0) {
    const validSources = ["weibo", "xiaohongshu", "bilibili", "zhihu", "douyin", "wechat", "baidu", "toutiao"]
    const filtered = requestedSources.filter(s => validSources.includes(s))
    if (filtered.length > 0) {
      args.push("--search", filtered.join(","))
    }
  }

  logger.info(`Spawning last30days.py with args: ${args.slice(1).join(" ")}`)

  return new Promise<Last30DaysResult>((resolve, reject) => {
    // 注入 LAST30DAYS_CN_CONFIG_DIR 到子进程的环境变量中
    const pyProcess = spawn("python3", args, {
      env: {
        ...getProcessEnvironment(),
        LAST30DAYS_CN_CONFIG_DIR: configDir,
      }
    })

    let stdoutData = ""
    let stderrData = ""
    let isFinished = false

    // 超时控制
    const timer = setTimeout(() => {
      if (isFinished) return
      isFinished = true
      try {
        pyProcess.kill("SIGTERM")
      } catch (e) {
        logger.error({ err: e }, "Failed to kill pyProcess on timeout")
      }
      reject(new Error("请求超时，检索多个平台的讨论耗时较长，请稍后重试"))
    }, timeoutMs)

    pyProcess.stdout.on("data", (data) => {
      stdoutData += data.toString()
    })

    pyProcess.stderr.on("data", (data) => {
      stderrData += data.toString()
    })

    pyProcess.on("close", (code) => {
      if (isFinished) return
      isFinished = true
      clearTimeout(timer)

      if (code !== 0) {
        logger.error(`last30days.py exited with code ${code}. Stderr: ${stderrData}`)
        reject(new Error("检索失败，请稍后重试"))
        return
      }

      try {
        const parsedReport = JSON.parse(stdoutData)
        const result = formatPythonReport(parsedReport, topic)
        resolve(result)
      } catch (err) {
        logger.error(`Failed to parse last30days.py output. Output: ${stdoutData}. Error: ${err}`)
        reject(new Error("检索数据解析失败，请稍后重试"))
      }
    })

    pyProcess.on("error", (err) => {
      if (isFinished) return
      isFinished = true
      clearTimeout(timer)
      logger.error(err, "Failed to start last30days.py child process")
      reject(new Error("检索启动失败，请稍后重试"))
    })
  })
}

/**
 * 转换 Python 脚本输出的 JSON 报告为前端一致的数据格式
 */
function formatPythonReport(report: any, originalTopic: string): Last30DaysResult {
  const items: Last30DaysItem[] = []
  const warnings: string[] = []

  // 1. 收集各个平台的异常错误
  const errorFields: Record<string, string> = {
    weibo_error: "微博",
    xiaohongshu_error: "小红书",
    bilibili_error: "哔哩哔哩",
    zhihu_error: "知乎",
    douyin_error: "抖音",
    wechat_error: "微信",
    baidu_error: "百度",
    toutiao_error: "今日头条"
  }

  for (const [field, label] of Object.entries(errorFields)) {
    if (report[field]) {
      warnings.push(`${label}数据获取受限: ${report[field]}`)
    }
  }

  // 2. 整合扁平化各个平台的数据
  // 微博
  if (Array.isArray(report.weibo)) {
    report.weibo.forEach((w: any) => {
      items.push({
        id: w.id || `weibo-${w.url}`,
        platform: "weibo",
        title: w.text || "微博内容",
        excerpt: w.text ? (w.text.length > 200 ? w.text.slice(0, 200) + "..." : w.text) : "",
        url: w.url,
        author: w.author_handle || "未知作者",
        date: w.date || "",
        score: w.score || 0,
        engagement: w.engagement
      })
    })
  }

  // 小红书
  if (Array.isArray(report.xiaohongshu)) {
    report.xiaohongshu.forEach((x: any) => {
      items.push({
        id: x.id || `xhs-${x.url}`,
        platform: "xiaohongshu",
        title: x.title || x.desc || "小红书图文",
        excerpt: x.desc || "",
        url: x.url,
        author: x.author_name || "未知作者",
        date: x.date || "",
        score: x.score || 0,
        engagement: x.engagement
      })
    })
  }

  // 哔哩哔哩
  if (Array.isArray(report.bilibili)) {
    report.bilibili.forEach((b: any) => {
      items.push({
        id: b.id || `bili-${b.url}`,
        platform: "bilibili",
        title: b.title || "B站视频",
        excerpt: b.description || "",
        url: b.url,
        author: b.channel_name || "未知 UP 主",
        date: b.date || "",
        score: b.score || 0,
        engagement: b.engagement
      })
    })
  }

  // 知乎
  if (Array.isArray(report.zhihu)) {
    report.zhihu.forEach((z: any) => {
      items.push({
        id: z.id || `zhihu-${z.url}`,
        platform: "zhihu",
        title: z.title || "知乎回答/文章",
        excerpt: z.excerpt || "",
        url: z.url,
        author: z.author || "匿名用户",
        date: z.date || "",
        score: z.score || 0,
        engagement: z.engagement
      })
    })
  }

  // 抖音
  if (Array.isArray(report.douyin)) {
    report.douyin.forEach((d: any) => {
      items.push({
        id: d.id || `douyin-${d.url}`,
        platform: "douyin",
        title: d.text || "抖音作品",
        excerpt: d.text ? (d.text.length > 200 ? d.text.slice(0, 200) + "..." : d.text) : "",
        url: d.url,
        author: d.author_name || "未知作者",
        date: d.date || "",
        score: d.score || 0,
        engagement: d.engagement
      })
    })
  }

  // 微信
  if (Array.isArray(report.wechat)) {
    report.wechat.forEach((wc: any) => {
      items.push({
        id: wc.id || `wechat-${wc.url}`,
        platform: "wechat",
        title: wc.title || "微信公众号文章",
        excerpt: wc.snippet || "",
        url: wc.url,
        author: wc.source_name || "公众号",
        date: wc.date || "",
        score: wc.score || 0,
        engagement: wc.engagement
      })
    })
  }

  // 百度
  if (Array.isArray(report.baidu)) {
    report.baidu.forEach((bd: any) => {
      items.push({
        id: bd.id || `baidu-${bd.url}`,
        platform: "baidu",
        title: bd.title || "百度网页",
        excerpt: bd.snippet || "",
        url: bd.url,
        author: bd.source_domain || "互联网",
        date: bd.date || "",
        score: bd.score || 0,
        engagement: bd.engagement
      })
    })
  }

  // 头条
  if (Array.isArray(report.toutiao)) {
    report.toutiao.forEach((t: any) => {
      items.push({
        id: t.id || `toutiao-${t.url}`,
        platform: "toutiao",
        title: t.title || "今日头条内容",
        excerpt: t.abstract || "",
        url: t.url,
        author: t.source_name || "头条号",
        date: t.date || "",
        score: t.score || 0,
        engagement: t.engagement
      })
    })
  }

  // 按照分数从高到低排序，如果分数相同按发布时间排序
  items.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  })

  // 3. 获取已覆盖并有返回结果的 sources 列表
  const allPlatforms = ["weibo", "xiaohongshu", "bilibili", "zhihu", "douyin", "wechat", "baidu", "toutiao"]
  const effectiveSources = allPlatforms.filter(plat => {
    // 如果没有配置该平台且有该平台的 error，通常说明没有运行该平台，但如果有了 items 我们仍算有效
    const hasItems = items.some(item => item.platform === plat)
    return hasItems
  })

  // 4. 时间段范围整理
  const range = report.range || {}
  const dateRange = {
    from: range.from || "",
    to: range.to || ""
  }

  return {
    topic: report.topic || originalTopic,
    dateRange,
    sources: effectiveSources.length > 0 ? effectiveSources : (report.mode === "all" ? allPlatforms : [report.mode]),
    items,
    warnings,
    summary: report.context_snippet_md || ""
  }
}
