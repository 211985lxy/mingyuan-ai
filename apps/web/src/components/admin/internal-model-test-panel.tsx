"use client"

import React from "react"
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

type ModelProvider = "jiekou" | "openrouter"

const PROVIDER_MODELS: Record<
  ModelProvider,
  Array<{ value: string; label: string; free?: boolean }>
> = {
  jiekou: [
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "deepseek-chat", label: "deepseek-chat" },
    { value: "deepseek-reasoner", label: "deepseek-reasoner" },
    { value: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
  ],
  openrouter: [
    { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6（付费）" },
    { value: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B（免费·中文强）", free: true },
    { value: "google/gemma-4-31b-it:free", label: "Gemma 4 31B（免费·质量最高）", free: true },
    { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B（免费）", free: true },
    { value: "nousresearch/hermes-3-llama-3.1-405b:free", label: "Hermes 3 405B（免费·超大）", free: true },
    { value: "openrouter/free", label: "自动路由（免费·随机选）", free: true },
  ],
}

async function readModelTestStream(response: Response, onContent: (content: string) => void) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("无法读取响应流")
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6)
      if (data === "[DONE]") continue
      try {
        const parsed = JSON.parse(data) as { content?: unknown }
        if (typeof parsed.content === "string") onContent(parsed.content)
      } catch {
        // Ignore incomplete or non-JSON SSE lines, matching the existing behavior.
      }
    }
  }
}

interface ModelTestRequest {
  provider: ModelProvider
  prompt: string
  model: string
  temperature: number
  maxTokens: number
  streamEnabled: boolean
}

async function runModelTest(
  request: ModelTestRequest,
  token: string,
  onContent: (content: string) => void,
) {
  const response = await fetch("/api/admin/jiekou/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      provider: request.provider,
      messages: [{ role: "user", content: request.prompt }],
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: request.streamEnabled,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({} as { error?: string }))
    throw new Error(error.error || "测试失败")
  }
  if (request.streamEnabled) {
    await readModelTestStream(response, onContent)
    return ""
  }
  const data = await response.json() as { content?: string }
  return data.content || ""
}

interface ModelTestFieldsProps extends ModelTestRequest {
  onProviderChange: (provider: ModelProvider) => void
  onModelChange: (model: string) => void
  onTemperatureChange: (temperature: number) => void
  onMaxTokensChange: (maxTokens: number) => void
  onPromptChange: (prompt: string) => void
}

function ModelTestFields(props: ModelTestFieldsProps) {
  return <>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">通道</Label>
        <Select value={props.provider} onValueChange={(value) => props.onProviderChange(value === "openrouter" ? "openrouter" : "jiekou")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="jiekou">JieKou（接口AI · gpt/deepseek）</SelectItem>
            <SelectItem value="openrouter">OpenRouter（含免费模型）</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">模型</Label>
        <Select value={props.model} onValueChange={(value) => props.onModelChange(value ?? props.model)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{PROVIDER_MODELS[props.provider].map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-xs">Temperature（{props.temperature}）</Label>
        <input type="range" min="0" max="2" step="0.1" value={props.temperature} onChange={(event) => props.onTemperatureChange(Number(event.target.value))} className="h-9 w-full" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Max Tokens</Label>
        <Input type="number" value={props.maxTokens} onChange={(event) => props.onMaxTokensChange(Number(event.target.value))} className="h-9" />
      </div>
    </div>
    <div className="space-y-1.5">
      <Label className="text-xs">测试提示词</Label>
      <Textarea value={props.prompt} onChange={(event) => props.onPromptChange(event.target.value)} placeholder="输入测试内容，例如：你好，请用一句话介绍你自己。" rows={3} />
    </div>
  </>
}

function ModelTestActions(props: {
  streamEnabled: boolean
  loading: boolean
  result: string
  disabled: boolean
  onStreamChange: (enabled: boolean) => void
  onTest: () => void
}) {
  return <>
    <div className="flex items-center gap-4">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={props.streamEnabled} onChange={(event) => props.onStreamChange(event.target.checked)} className="cursor-pointer" />
        流式输出
      </label>
      <div className="flex-1" />
      <Button onClick={props.onTest} disabled={props.loading || props.disabled} className="cursor-pointer">
        {props.loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
        {props.loading ? "调用中..." : "测试调用"}
      </Button>
    </div>
    {(props.result || props.loading) && <div className="space-y-1.5">
      <Label className="text-xs">返回结果</Label>
      <div className="min-h-20 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
        {props.result || <span className="text-muted-foreground">等待返回...</span>}
        {props.loading && props.result && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary" />}
      </div>
    </div>}
  </>
}

/**
 * @description internalmodeltestpanel
 * @param options - 配置选项
 * @returns 无返回值
 */
export function InternalModelTestPanel({ getToken }: { getToken: () => string }) {
  const [open, setOpen] = React.useState(false)
  const [request, setRequest] = React.useState<ModelTestRequest>({
    provider: "jiekou", prompt: "", model: "gpt-4o", temperature: 0.7,
    maxTokens: 4000, streamEnabled: true,
  })
  const [result, setResult] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function handleTest() {
    if (!request.prompt.trim()) return
    setLoading(true)
    setResult("")
    try {
      const content = await runModelTest(request, getToken(), (delta) => setResult((value) => value + delta))
      if (content) setResult(content)
    } catch (error) {
      setResult(`错误: ${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setLoading(false)
    }
  }

  const update = <K extends keyof ModelTestRequest>(key: K, value: ModelTestRequest[K]) => setRequest((current) => ({ ...current, [key]: value }))
  return <Card>
    <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((value) => !value)}>
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />中转站测试（内部）</CardTitle>
        <span className="text-xs text-muted-foreground">{open ? "收起 ▲" : "展开 ▼"}</span>
      </div>
    </CardHeader>
    {open && <CardContent className="space-y-4">
      <p className="text-xs text-muted-foreground">切换通道测试不同模型：JieKou（接口AI）或 OpenRouter（含免费模型，每天 200 次）。默认 gpt-4o，支持流式输出。</p>
      <ModelTestFields {...request}
        onProviderChange={(provider) => setRequest((current) => ({ ...current, provider, model: PROVIDER_MODELS[provider][0].value }))}
        onModelChange={(value) => update("model", value)} onTemperatureChange={(value) => update("temperature", value)}
        onMaxTokensChange={(value) => update("maxTokens", value)} onPromptChange={(value) => update("prompt", value)} />
      <ModelTestActions streamEnabled={request.streamEnabled} loading={loading} result={result} disabled={!request.prompt.trim()}
        onStreamChange={(value) => update("streamEnabled", value)} onTest={handleTest} />
    </CardContent>}
  </Card>
}
