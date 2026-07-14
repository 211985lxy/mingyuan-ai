import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { JIEKOU_PROVIDER_MODELS } from "@/features/knowledge/admin-knowledge-shared"

export function JiekouTestPanel() {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<"jiekou" | "openrouter">("jiekou")
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("gpt-4o")
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4000)
  const [result, setResult] = useState("")
  const [loading, setLoading] = useState(false)
  const [streamEnabled, setStreamEnabled] = useState(true)
  const modelOptions = JIEKOU_PROVIDER_MODELS[provider] || []

  async function handleTest() {
    if (!prompt.trim()) return
    setLoading(true)
    setResult("")
    try {
      const response = await fetch("/api/admin/jiekou/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          messages: [{ role: "user", content: prompt }],
          model,
          temperature,
          max_tokens: maxTokens,
          stream: streamEnabled,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({} as { error?: string }))
        throw new Error(error.error || "测试失败")
      }

      if (streamEnabled) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new Error("无法读取响应流")
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of decoder.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) setResult((current) => current + parsed.content)
            } catch {
              // Ignore incomplete stream chunks.
            }
          }
        }
      } else {
        const data = await response.json()
        setResult(data.content || "")
      }
    } catch (error) {
      setResult(`错误: ${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((current) => !current)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            中转站测试（内部）
          </CardTitle>
          <span className="text-xs text-muted-foreground">{open ? "收起 ▲" : "展开 ▼"}</span>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            切换通道测试不同模型：JieKou（接口AI）或 OpenRouter（含免费模型，每天 200 次）。默认 gpt-4o，支持流式输出。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">通道</Label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  const nextProvider = value === "openrouter" ? "openrouter" : "jiekou"
                  setProvider(nextProvider)
                  const first = JIEKOU_PROVIDER_MODELS[nextProvider]?.[0]
                  if (first) setModel(first.value)
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jiekou">JieKou（接口AI · gpt/deepseek）</SelectItem>
                  <SelectItem value="openrouter">OpenRouter（含免费模型）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">模型</Label>
              <Select value={model} onValueChange={(value) => setModel(value ?? model)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature（{temperature}）</Label>
              <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} className="w-full h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Tokens</Label>
              <Input type="number" value={maxTokens} onChange={(event) => setMaxTokens(Number(event.target.value))} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">测试提示词</Label>
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="输入测试内容，例如：你好，请用一句话介绍你自己。" rows={3} />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={streamEnabled} onChange={(event) => setStreamEnabled(event.target.checked)} className="cursor-pointer" />
              流式输出
            </label>
            <div className="flex-1" />
            <Button onClick={handleTest} disabled={loading || !prompt.trim()} className="cursor-pointer">
              {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />调用中...</> : <><Sparkles className="h-4 w-4 mr-1" />测试调用</>}
            </Button>
          </div>
          {(result || loading) && (
            <div className="space-y-1.5">
              <Label className="text-xs">返回结果</Label>
              <div className="min-h-20 rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {result || <span className="text-muted-foreground">等待返回...</span>}
                {loading && result && <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse" />}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
