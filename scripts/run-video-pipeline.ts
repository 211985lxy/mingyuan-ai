/**
 * Full Video Production Pipeline Script
 *
 * Steps:
 * 1. Fetch public virtual humans (avatars)
 * 2. Fetch public voices
 * 3. Fetch templates for virtualman scene
 * 4. Submit a virtualman_broadcast video generation task
 * 5. Poll for completion
 */

import "dotenv/config"

const BASE_URL = "https://openapi.shanjian.tv"
const APP_KEY = process.env.SHANJIAN_API_KEY || ""

async function api<T>(
  method: "GET" | "POST",
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v)
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${APP_KEY}`,
      "Content-Type": "application/json",
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const json = await res.json() as { code: string; data: T; message?: string; requestId: string }

  if (json.code !== "Succeed") {
    console.error(`API Error: ${json.code} - ${json.message}`)
    console.error(`Request ID: ${json.requestId}`)
    throw new Error(`Shanjian API error: ${json.code} - ${json.message}`)
  }

  return json.data
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  if (!APP_KEY) {
    console.error("ERROR: SHANJIAN_API_KEY is not set in .env")
    process.exit(1)
  }

  console.log("=== 明远AIM Video Production Pipeline ===\n")
  console.log(`API Key: ${APP_KEY.slice(0, 6)}...${APP_KEY.slice(-4)}`)

  // ─── Step 1: Fetch Public Virtual Humans ──────────────────

  console.log("\n--- Step 1: Fetching public virtual humans ---")

  const virtualmenData = await api<{ results: Array<{ id: string; name: string; gender: string; coverUrl: string }> }>(
    "GET",
    "/v1/assets/virtualman/common"
  )

  const virtualmen = virtualmenData.results
  console.log(`Found ${virtualmen.length} public virtual humans:`)
  virtualmen.slice(0, 10).forEach((v, i) => {
    console.log(`  [${i}] ${v.name} (${v.gender}) - ID: ${v.id}`)
  })
  if (virtualmen.length > 10) console.log(`  ... and ${virtualmen.length - 10} more`)

  const selectedAvatar = virtualmen[0]
  console.log(`\n>> Selected avatar: ${selectedAvatar.name} (ID: ${selectedAvatar.id})`)

  // ─── Step 2: Fetch Public Voices ──────────────────────────

  console.log("\n--- Step 2: Fetching public voices ---")

  const voicesData = await api<{ results: Array<{ id: string; name: string; gender: string; langs: string[] }> }>(
    "GET",
    "/v1/assets/voice/common"
  )

  const voices = voicesData.results
  console.log(`Found ${voices.length} public voices:`)
  voices.slice(0, 10).forEach((v, i) => {
    console.log(`  [${i}] ${v.name} (${v.gender}) - langs: ${v.langs.join(", ")} - ID: ${v.id}`)
  })
  if (voices.length > 10) console.log(`  ... and ${voices.length - 10} more`)

  const selectedVoice = voices.find(v => v.gender === selectedAvatar.gender && v.langs.includes("zh")) || voices[0]
  console.log(`\n>> Selected voice: ${selectedVoice.name} (ID: ${selectedVoice.id})`)

  // ─── Step 3: Fetch Templates ─────────────────────────────

  console.log("\n--- Step 3: Fetching virtualman templates ---")

  const templatesData = await api<{ results: Array<{ id: string; name: string; coverUrl: string; scene: string }> }>(
    "GET",
    "/v1/clip/template",
    { params: { scene: "virtualman", pageSize: "20" } }
  )

  const templates = templatesData.results
  console.log(`Found ${templates.length} virtualman templates:`)
  templates.slice(0, 10).forEach((t, i) => {
    console.log(`  [${i}] ${t.name} - ID: ${t.id}`)
  })
  if (templates.length > 10) console.log(`  ... and ${templates.length - 10} more`)

  const selectedTemplate = templates[0]
  console.log(`\n>> Selected template: ${selectedTemplate.name} (ID: ${selectedTemplate.id})`)

  // ─── Step 4: Submit Video Generation Task ─────────────────

  console.log("\n--- Step 4: Submitting virtualman_broadcast video task ---")

  const scriptContent = "大家好，欢迎来到明远AIM短视频制作平台！我们致力于帮助每一位创作者，轻松高效地制作出专业级的短视频内容。无论你是个人品牌打造者，还是小企业主，明远AIM都能为你提供一站式的视频制作解决方案。让我们一起，用视频的力量，讲述你的故事！"

  console.log(`Script (${scriptContent.length} chars):`)
  console.log(`  "${scriptContent.slice(0, 60)}..."`)

  const taskRequest = {
    styleId: selectedTemplate.id,
    virtualmanId: selectedAvatar.id,
    content: scriptContent,
    speakerId: selectedVoice.id,
    title: "明远AIM Demo Video",
    packRules: {
      subtitleSwitch: true,
    },
    processRules: {
      watermarkShow: false,
    },
  }

  console.log("\nRequest payload:")
  console.log(JSON.stringify(taskRequest, null, 2))

  const taskData = await api<{ taskId: string }>(
    "POST",
    "/v1/clip/video/virtualman_broadcast",
    { body: taskRequest }
  )

  const taskId = taskData.taskId
  console.log(`\n>> Task submitted! Task ID: ${taskId}`)

  // ─── Step 5: Poll for Completion ──────────────────────────

  console.log("\n--- Step 5: Polling for task completion ---")

  const POLL_INTERVAL = 10_000
  const MAX_POLLS = 60

  for (let i = 1; i <= MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL)

    const taskInfo = await api<{
      taskId: string
      status: string
      result?: {
        videoUrl?: string
        coverUrl?: string
        duration?: number
      }
      errorCode?: string
      errorMessage?: string
    }>("GET", "/v1/task/info", { params: { taskId } })

    const elapsed = i * (POLL_INTERVAL / 1000)
    console.log(`  [${elapsed}s] Status: ${taskInfo.status}`)

    if (taskInfo.status === "succeed") {
      console.log("\n=== VIDEO GENERATION COMPLETE ===")
      console.log(`  Video URL: ${taskInfo.result?.videoUrl}`)
      console.log(`  Cover URL: ${taskInfo.result?.coverUrl}`)
      console.log(`  Duration:  ${taskInfo.result?.duration}s`)
      console.log("\nDone!")
      process.exit(0)
    }

    if (taskInfo.status === "failed") {
      console.error("\n=== VIDEO GENERATION FAILED ===")
      console.error(`  Error Code: ${taskInfo.errorCode}`)
      console.error(`  Error Message: ${taskInfo.errorMessage}`)
      process.exit(1)
    }
  }

  console.error("\nTimeout: task did not complete within 10 minutes")
  console.log(`You can manually check: taskId = ${taskId}`)
  process.exit(1)
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
