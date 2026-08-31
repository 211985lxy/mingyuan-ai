import { existsSync, readFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Digital-human / video generation domain has been restored.
 * This guard now only ensures ASR (transcribe) contracts remain intact.
 */
const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

const retainedAsrContracts = [
  [resolve(webRoot, "src/app/api/aim/transcribe/route.ts"), "ALIYUN_NLS_APP_KEY"],
  [resolve(webRoot, "src/lib/api/aim-chat.ts"), "/api/aim/transcribe"],
  [resolve(webRoot, "src/hooks/use-audio-recorder.ts"), "transcribeFn"],
  [resolve(webRoot, ".env.example"), "ALIYUN_NLS_APP_KEY"],
  [resolve(webRoot, ".env.production.example"), "ALIYUN_NLS_APP_KEY"],
]

const violations = []
for (const [file, requiredText] of retainedAsrContracts) {
  if (!existsSync(file) || !readFileSync(file, "utf8").includes(requiredText)) {
    violations.push(`${relative(resolve(webRoot, "../.."), file)} must retain ASR contract ${requiredText}`)
  }
}

if (violations.length > 0) {
  console.error("ASR retention check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("retired-capability-guard-ok mode=digital-human-restored asr=retained")
