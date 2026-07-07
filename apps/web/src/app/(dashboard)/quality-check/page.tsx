"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ShieldCheck, Loader2, Sparkles, Clipboard, Check, Trash2, BookOpen, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  checkScriptQuality,
  polishScript,
  listAimHistory,
  type QualityCheckReport,
  type AimGeneration,
} from "@/lib/api/client"
import { QualityReportCard } from "@/components/quality-report"

const checkDimensions = [
  { title: "编辑质量", desc: "文字流畅度、错别字检控与文章整体结构层次", icon: "✍️" },
  { title: "AI 味检测", desc: "敏感AI高频词过滤，确保文案具备真人呼吸感与口语度", icon: "💨" },
  { title: "爆款吸引力", desc: "前三秒黄金抓人钩子，痛点与痛感是否直击人心", icon: "🎯" },
  { title: "表达逻辑性", desc: "起承转合与CTA行动号召是否连贯自然，不突兀", icon: "🧩" },
]

export default function QualityCheckPage() {
  const [content, setContent] = useState("")
  const [topicTitle, setTopicTitle] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [isPolishing, setIsPolishing] = useState(false)
  const [report, setReport] = useState<QualityCheckReport | null>(null)
  
  const [history, setHistory] = useState<AimGeneration[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // 初始化拉取历史记录
  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await listAimHistory(1, 5)
        setHistory(data)
      } catch (err) {
        console.error("Failed to load AIM history for quality check:", err)
      } finally {
        setHistoryLoading(false)
      }
    }
    loadHistory()
  }, [])

  // 触发质量评估
  async function handleCheck() {
    const text = content.trim()
    if (!text) {
      toast.error("请先输入或导入文案内容")
      return
    }
    setIsChecking(true)
    try {
      const response = await checkScriptQuality({
        content: text,
        topicTitle: topicTitle || undefined,
      })
      setReport(response)
      toast.success("多维质量评估已完成")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "评估失败，请重试")
    } finally {
      setIsChecking(false)
    }
  }

  // 触发 AI 润色
  async function handlePolish() {
    if (!report || !content.trim()) return

    const weakDimensions: string[] = []
    if (report.editorial.score < 80) weakDimensions.push("editorial")
    if (report.aiTaste.score < 80) weakDimensions.push("aiTaste")
    if (report.attraction.score < 80) weakDimensions.push("attraction")
    if (report.logic.score < 80) weakDimensions.push("logic")

    setIsPolishing(true)
    toast.info("正在调配太极墨宝进行靶向局部精改...")
    try {
      const polishResult = await polishScript({
        content: content,
        weakDimensions: weakDimensions.length > 0 ? weakDimensions : undefined,
        topicTitle: topicTitle || undefined,
      })

      // 1. 更新文本域内容
      setContent(polishResult.polished)
      toast.success("AI 润色修改完成！正在为您重新检测...")

      // 2. 自动重新检测
      setIsChecking(true)
      const newReport = await checkScriptQuality({
        content: polishResult.polished,
        topicTitle: topicTitle || undefined,
      })
      setReport(newReport)
      toast.success("重新评估完成，分数已更新！")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "润色失败，请重试")
    } finally {
      setIsPolishing(false)
      setIsChecking(false)
    }
  }

  // 复制当前文案
  async function handleCopy() {
    if (!content.trim()) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    toast.success("文案已复制到剪贴板")
    setTimeout(() => setCopied(false), 2000)
  }

  // 清空文案
  function handleClear() {
    setContent("")
    setTopicTitle("")
    setReport(null)
    toast.info("已清空当前编辑区")
  }

  // 导入历史文案
  function handleImport(text: string, format: string, topic?: string) {
    setContent(text)
    setTopicTitle(topic || "")
    setReport(null) // 导入新文案后重置旧报告
    toast.success(`已导入最近生成的 ${format} 文案`)
  }

  return (
    <div className="space-y-6 pb-10">
      {/* 头部信息 */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-amber-600 bg-clip-text text-transparent">内容质检官</h1>
          <Badge className="badge-gold border-none px-2 py-0.5 rounded-sm text-xs">四维门控闭环</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          对撰写的文案进行编辑质量、AI味、爆款吸引力与表达逻辑四维评估，提供权威评分、缺陷诊断与一键局部靶向润色。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* 左侧栏：文案输入与历史快速导入 */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border border-border/80 shadow-xs relative overflow-hidden">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                文案沙盘编辑区
              </CardTitle>
              <div className="flex items-center gap-2">
                {content.trim() && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      className="h-7 text-xs gap-1 hover:bg-secondary/80 cursor-pointer"
                    >
                      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Clipboard className="h-3 w-3" />}
                      {copied ? "已复制" : "复制"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="h-7 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      清空
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在此输入您的营销文案、视频脚本或朋友圈文案；或者点击下方的「最近生成」直接快速导入进行多维检测。"
                  className="min-h-72 resize-y pb-12 text-sm leading-relaxed bg-neutral-100/40 dark:bg-[#131211] border-border/80 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary focus-within:shadow-[0_0_20px_rgba(179,50,38,0.15)]"
                  disabled={isChecking || isPolishing}
                />
                
                {/* 智能评估中水墨太极遮罩 */}
                {isChecking && (
                  <div className="absolute inset-0 ink-wash-mask flex flex-col items-center justify-center rounded-lg transition-all duration-500 z-30">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="relative flex items-center justify-center">
                        <svg className="h-24 w-24 text-primary" viewBox="0 0 100 100" fill="currentColor">
                          <g className="tai-chi-rotate" style={{ animationDirection: 'reverse', animationDuration: '15s', transformOrigin: '50px 50px' }}>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3" />
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(0 50 50)">☰</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(45 50 50)">☱</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(90 50 50)">☲</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(135 50 50)">☳</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(180 50 50)">☷</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(225 50 50)">☴</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(270 50 50)">☵</text>
                            <text x="50" y="14" textAnchor="middle" fontSize="6.5" fontFamily="serif" fill="currentColor" transform="rotate(315 50 50)">☶</text>
                          </g>
                          <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
                          <g className="tai-chi-rotate" style={{ animationDuration: '6s', transformOrigin: '50px 50px' }}>
                            <path d="M 50 18 A 16 16 0 0 0 50 50 A 16 16 0 0 1 50 82 A 32 32 0 0 0 50 18 Z" fill="currentColor" />
                            <circle cx="50" cy="34" r="3.5" fill="var(--background)" />
                            <circle cx="50" cy="66" r="3.5" fill="currentColor" />
                            <circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" strokeWidth="1" />
                          </g>
                        </svg>
                      </div>
                      <p className="text-xs font-semibold tracking-widest text-primary animate-pulse">
                        【太极门控】正在多维交叉检控中...
                      </p>
                    </div>
                  </div>
                )}
                
                {/* 智能润色中水墨遮罩 */}
                {isPolishing && (
                  <div className="absolute inset-0 ink-wash-mask flex flex-col items-center justify-center rounded-lg transition-all duration-500 z-30">
                    <div className="flex flex-col items-center space-y-4">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-xs font-semibold tracking-widest text-primary animate-pulse">
                        【太极墨宝】正在靶向精改并自动复检...
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono">
                  {content.length} 字
                </div>
              </div>

              {topicTitle && (
                <div className="rounded-md bg-muted/30 border border-border/80 px-3.5 py-2 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">当前挂载选题</Badge>
                    <span className="text-xs font-semibold text-foreground/80 truncate max-w-[280px]">{topicTitle}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTopicTitle("")}
                    className="h-6 px-1.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0 cursor-pointer"
                  >
                    解除挂载
                  </Button>
                </div>
              )}

              <Button
                onClick={handleCheck}
                disabled={isChecking || isPolishing || !content.trim()}
                className="w-full cursor-pointer gap-2 bg-fire-earth-gradient text-primary-foreground shadow-md hover:opacity-95 hover:scale-[1.005] active:scale-[0.995] transition-all duration-300 font-semibold tracking-wider h-11"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    太极八卦门控检证中...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4.5 w-4.5 text-amber-300" />
                    开始内容质检
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 一键导入最近生成文案 */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              一键导入最近生成的文案
            </h2>
            
            {historyLoading ? (
              <div className="flex items-center justify-center p-8 border border-dashed border-border rounded-xl">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60 mr-2" />
                <span className="text-xs text-muted-foreground">正在加载历史生成...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-muted/5">
                <p className="text-xs text-muted-foreground">还没有生成过文案，建议先去 <Link href="/aim" className="text-primary font-semibold hover:underline">内容生产官</Link> 创作您的专属文案。</p>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {history.slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/80 bg-card hover:border-primary/30 p-4 space-y-3 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {new Date(item.createdAt).toLocaleDateString("zh-CN")} 生成
                        </span>
                        {item.topicTitle && (
                          <Badge variant="outline" className="badge-gold border-none px-1.5 py-0 rounded-xs text-[8px] font-semibold truncate max-w-[120px]">
                            {item.topicTitle}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground/80 font-medium line-clamp-2 leading-relaxed select-text">
                        {item.rawInput}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/30">
                      {item.videoScript && (
                        <button
                          type="button"
                          className="px-2 py-1 text-[9px] font-medium border border-border/80 hover:border-primary/50 hover:bg-primary/5 text-foreground/80 hover:text-primary rounded-md cursor-pointer transition-all duration-200"
                          onClick={() => handleImport(item.videoScript!, "视频脚本", item.topicTitle || undefined)}
                        >
                          视频脚本
                        </button>
                      )}
                      {item.wechatArticle && (
                        <button
                          type="button"
                          className="px-2 py-1 text-[9px] font-medium border border-border/80 hover:border-primary/50 hover:bg-primary/5 text-foreground/80 hover:text-primary rounded-md cursor-pointer transition-all duration-200"
                          onClick={() => handleImport(item.wechatArticle!, "公众号", item.topicTitle || undefined)}
                        >
                          公众号
                        </button>
                      )}
                      {item.momentsPost && (
                        <button
                          type="button"
                          className="px-2 py-1 text-[9px] font-medium border border-border/80 hover:border-primary/50 hover:bg-primary/5 text-foreground/80 hover:text-primary rounded-md cursor-pointer transition-all duration-200"
                          onClick={() => handleImport(item.momentsPost!, "朋友圈", item.topicTitle || undefined)}
                        >
                          朋友圈
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧栏：检测结果展板 */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border border-border/80 shadow-xs h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-muted/30">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-primary animate-pulse" />
                内容质检报告
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pt-5">
              {report ? (
                <div className="space-y-4 animate-in fade-in-50 duration-300 h-full flex flex-col justify-between">
                  <QualityReportCard
                    report={report}
                    onPolish={handlePolish}
                    isPolishing={isPolishing}
                  />
                  
                  {report.overall.passed ? (
                    <div className="rounded-xl border border-green-200 bg-green-50/50 dark:bg-green-950/10 p-4 flex gap-3 items-start">
                      <Sparkles className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-green-800 dark:text-green-300">🎉 恭喜！当前文案已成功通关质量门控</p>
                        <p className="text-[10px] text-green-600/80 dark:text-green-400/80 mt-0.5 leading-relaxed">
                          各项评分优异，AI味已有效过滤，前三秒吸引力与表达逻辑通顺，属于可直接投产的爆款级别，去发布吧！
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-4 flex gap-3 items-start">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">💡 检检小提示：一键润色提升得分</p>
                        <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                          部分评估维度低于80分达标线。您可以直接点击右上方「AI 润色」按钮，太极墨宝将针对不及格维度进行靶向精改重写，自动完成飞跃提升！
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 px-6 text-center space-y-4 flex flex-col items-center justify-center flex-1">
                  <div className="size-16 rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center bg-muted/5 shadow-[inset_0_0_12px_rgba(0,0,0,0.02)]">
                    <ShieldCheck className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-sm font-semibold text-foreground/80">沙盘虚位以待，请开始检测</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      检测引擎完全采用沙箱计算，在左侧编辑区输入您的内容或导入最近生成的历史，点击「开始内容质检」即刻出具四维门控报告。
                    </p>
                  </div>
                  
                  <div className="grid gap-3 grid-cols-2 w-full pt-4 max-w-md">
                    {checkDimensions.map((dim) => (
                      <div key={dim.title} className="rounded-lg border border-border/60 bg-muted/10 p-3 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{dim.icon}</span>
                          <span className="text-xs font-semibold text-foreground/80">{dim.title}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">{dim.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
