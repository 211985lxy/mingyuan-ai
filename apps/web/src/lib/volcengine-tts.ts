import { randomUUID } from "crypto"

const VOLC_TTS_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
const DEFAULT_RESOURCE_ID = "seed-tts-2.0"
const DEFAULT_VOICE = "zh_female_vv_uranus_bigtts"

export async function synthesizeVolcengineSpeech(input: {
  text: string
  speaker?: string
  speedRatio?: number
  volume?: number
}) {
  const apiKey = process.env.VOLC_SPEECH_API_KEY
  if (!apiKey) throw new Error("未配置 VOLC_SPEECH_API_KEY")

  const response = await fetch(VOLC_TTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Api-Resource-Id": process.env.VOLC_TTS_RESOURCE_ID || DEFAULT_RESOURCE_ID,
      "X-Api-Request-Id": randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: "aim-web" },
      req_params: {
        text: input.text,
        speaker: input.speaker || process.env.VOLC_SPEECH_VOICE || DEFAULT_VOICE,
        audio_params: {
          format: "mp3",
          speed: input.speedRatio ?? 1,
          volume: input.volume ?? 1,
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  })

  const body = await response.text()
  if (!response.ok) throw new Error(`豆包语音合成失败: ${response.status} ${body.slice(0, 300)}`)

  const audioBase64 = extractAudioBase64(body)
  if (!audioBase64) throw new Error(`豆包语音合成未返回音频: ${body.slice(0, 300)}`)

  return {
    audioBase64,
    mimeType: "audio/mpeg",
  }
}

function extractAudioBase64(streamText: string) {
  const chunks: string[] = []
  for (const jsonText of splitConcatenatedJson(streamText)) {
    const item = JSON.parse(jsonText) as { code?: number; data?: string; message?: string }
    const isSuccessFrame =
      item.code === undefined || item.code === 0 || item.code === 20000000
    if (!isSuccessFrame) {
      throw new Error(item.message || "豆包语音合成失败")
    }
    if (item.data) chunks.push(item.data)
  }
  return chunks.join("")
}

function splitConcatenatedJson(input: string) {
  const chunks: string[] = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (inString) {
      escaped = char === "\\" && !escaped
      if (char === "\"" && !escaped) inString = false
      if (char !== "\\") escaped = false
      continue
    }
    if (char === "\"") inString = true
    if (char === "{") {
      if (depth === 0) start = index
      depth += 1
    }
    if (char === "}") {
      depth -= 1
      if (depth === 0 && start >= 0) chunks.push(input.slice(start, index + 1))
    }
  }

  return chunks
}
