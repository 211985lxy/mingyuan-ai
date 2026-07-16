import { env, getProcessEnvironment } from "@/env"
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { logger } from '@/lib/logger'
import type { NormalizedAccount, NormalizedVideo, NormalizedComment } from '../tikhub/types'

export interface LocalCrawlerResult {
  account: NormalizedAccount
  videos: NormalizedVideo[]
  comments: NormalizedComment[]
}

const log = logger.child({ component: 'LocalPlaywrightCrawler' })

/**
 * 智能寻找本地 social-auto-upload 子系统的绝对物理路径
 */
function findSocialAutoUploadDir(): string {
  let current = process.cwd()
  // 向上最多递归查找 4 层以穿透 monorepo 目录深度
  for (let i = 0; i < 4; i++) {
    const target = path.join(current, 'social-auto-upload')
    if (fs.existsSync(target)) {
      return target
    }
    current = path.dirname(current)
  }
  // 兜底返回相对路径
  return path.resolve(process.cwd(), '../../social-auto-upload')
}

/**
 * 智能探活并返回最可用的 Python 解释器路径
 */
function findBestPythonInterpreter(sauDir: string): { binary: string; useUv: boolean } {
  // 1. 优先尝试使用 social-auto-upload 下通过 uv 创建的专属虚拟环境 .venv
  const venvPython = path.join(sauDir, '.venv', 'bin', 'python')
  if (fs.existsSync(venvPython)) {
    log.info({ venvPython }, '自适应决策：检测到专属 Python 虚拟环境，优先采用')
    return { binary: venvPython, useUv: false }
  }

  // 2. 检查系统中是否有全局的 uv 解释器，以便动态补全依赖
  log.info('自适应决策：未检测到虚拟环境，将降级尝试使用系统全局 python/uv')
  return { binary: 'python3', useUv: true }
}

/**
 * 调用本地的 Python 拦截爬虫抓取抖音/小红书数据
 * 
 * @param platform 平台类型
 * @param targetUrl 博主个人主页 URL
 * @param count 期望抓取的视频/作品数 (默认 50)
 */
export async function fetchFromLocalCrawler(
  platform: 'douyin' | 'xiaohongshu',
  targetUrl: string,
  count: number = 50
): Promise<LocalCrawlerResult> {
  const sauDir = findSocialAutoUploadDir()
  const crawlerScript = path.join(sauDir, 'crawler.py')

  if (!fs.existsSync(crawlerScript)) {
    throw new Error(`[LocalCrawler] 物理路径异常：未在 ${sauDir} 下找到 crawler.py 爬虫核心脚本。`)
  }

  const { binary, useUv } = findBestPythonInterpreter(sauDir)
  
  // 参数构建
  let cmd = binary
  let args: string[] = []

  if (useUv) {
    // 若使用全局 uv 降级调度以自动适配依赖
    cmd = 'uv'
    args = ['run', 'python', crawlerScript]
  } else {
    args = [crawlerScript]
  }

  args.push('--platform', platform)
  args.push('--url', targetUrl)
  args.push('--count', String(count))
  // 本地交付版默认打开可见浏览器；如需服务器静默运行，可显式配置 LOCAL_CRAWLER_HEADLESS=true。
  const headlessOpt = env.LOCAL_CRAWLER_HEADLESS === 'true' ? 'true' : 'false'
  args.push('--headless', headlessOpt)

  const cdpPort = env.LOCAL_CRAWLER_CDP_PORT
  if (cdpPort && /^\d+$/.test(cdpPort)) {
    args.push('--cdp-port', cdpPort)
  }

  log.info({ cmd, args, cwd: sauDir }, `启动本地 Python 拦截爬虫子进程 [${platform}]`)

  return new Promise<LocalCrawlerResult>((resolve, reject) => {
    let settled = false
    let killTimer: NodeJS.Timeout | null = null
    const pyProcess = spawn(cmd, args, {
      cwd: sauDir,
      env: {
        ...getProcessEnvironment(),
        PYTHONIOENCODING: 'utf-8',
        // 针对 Playwright 在特定国内网络下无法下载的阿里镜像源设置
        PLAYWRIGHT_DOWNLOAD_HOST: 'https://npmmirror.com/mirrors/playwright'
      }
    })

    const timeoutMs = Number(env.LOCAL_CRAWLER_TIMEOUT_MS || 30000)
    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      log.warn({ timeoutMs }, '本地爬虫执行超时，准备终止子进程')
      pyProcess.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (pyProcess.exitCode === null) {
          pyProcess.kill('SIGKILL')
        }
      }, 2000)
      reject(new Error(`本地浏览器抓取超过 ${Math.round(timeoutMs / 1000)} 秒，账号链接已保存，可以稍后再刷新。`))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timeoutTimer)
      if (killTimer) clearTimeout(killTimer)
    }

    const resolveOnce = (value: LocalCrawlerResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const rejectOnce = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    let stdoutBuffer = ''
    let stderrBuffer = ''

    pyProcess.stdout.on('data', (data) => {
      stdoutBuffer += data.toString()
    })

    pyProcess.stderr.on('data', (data) => {
      const line = data.toString().trim()
      if (line) {
        stderrBuffer += line + '\n'
        // 将爬虫的进度与拦截状态实时转发给 Next.js 服务端日志，便于运维排障
        log.info(`[PyCrawler Stderr] ${line}`)
      }
    })

    pyProcess.on('close', (code) => {
      log.info({ code }, '本地 Python 爬虫子进程运行结束')

      try {
        const trimmedStdout = stdoutBuffer.trim()
        if (!trimmedStdout) {
          throw new Error('本地爬虫未输出任何有效数据')
        }

        const parsed = JSON.parse(trimmedStdout)

        // 捕获 Python 返回包内部封装的致命错误
        if (parsed.error) {
          log.error({ pyError: parsed.error }, '本地爬虫内核报错')
          return rejectOnce(new Error(
            `本地物理抓取失败：${parsed.error}。\n诊断建议：${parsed.diagnose || '请确保博主链接正确，且本地网络可流畅开启代理访问。'}`
          ))
        }

        // 成功提取 Normalized 数据
        if (code === 0 && parsed.account && Array.isArray(parsed.videos)) {
          return resolveOnce({
            account: parsed.account as NormalizedAccount,
            videos: parsed.videos as NormalizedVideo[],
            comments: (parsed.comments || []) as NormalizedComment[]
          })
        }

        rejectOnce(new Error(`本地爬虫执行异常退出，退出码: ${code}。描述: ${stderrBuffer || '未获得标准输出数据'}`))
      } catch (err) {
        log.error({ err, code, stderr: stderrBuffer }, '解析本地爬虫输出数据失败')
        
        // 深入分析 stderr 提供最温暖人性化的报错诊断
        let userError = '本地抓取失败，请稍后重试。'
        if (stderrBuffer.includes('ModuleNotFoundError') || stderrBuffer.includes('依赖缺失')) {
          userError = '本地对标爬虫依赖包缺失。请在根目录下执行 `pnpm --filter social-auto-upload install` 或在 `social-auto-upload` 目录下执行 `uv pip install -r requirements.txt` 修复依赖。'
        } else if (stderrBuffer.includes('ExecutableNotFound') || stderrBuffer.includes('browser') || stderrBuffer.includes('chromium')) {
          userError = '本地 Playwright 未安装 Chromium 浏览器。请在终端执行：`cd social-auto-upload && uv run playwright install chromium` 安装抓取浏览器。'
        } else if (stderrBuffer.includes('Timeout') || stderrBuffer.includes('timeout')) {
          userError = '本地物理抓取超时。请确保您输入的目标链接在浏览器中能够流畅打开，且没有触发高频的抖音滑块验证码。'
        } else {
          userError = `本地物理抓取异常：${err instanceof Error ? err.message : String(err)}`
        }

        rejectOnce(new Error(userError))
      }
    })

    pyProcess.on('error', (err) => {
      log.error({ err }, '本地爬虫子进程触发致命异常')
      rejectOnce(new Error(`无法启动本地 Python 爬虫子进程，请确保系统已安装 python3 且在系统 Path 变量中。错误：${err.message}`))
    })
  })
}
