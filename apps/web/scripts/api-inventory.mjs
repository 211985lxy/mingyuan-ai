import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const apiRoot = join(root, "src/app/api")
const outputPath = join(root, "../../docs/architecture/api-inventory.json")
const checkOnly = process.argv.includes("--check")

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : entry.name === "route.ts" ? [path] : []
  })
}

function methodsOf(source) {
  const methods = new Set()
  for (const match of source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)) {
    methods.add(match[1])
  }
  return [...methods].sort()
}

function authOf(source, route) {
  // 显式标记优先：鉴权逻辑抽到共享模块时，路由源码不再出现密钥常量，
  // 由路由注释声明（仍需评审保证声明属实）。
  const declared = source.match(/api-inventory:\s*auth=(signed_integration)\b/)?.[1]
  if (declared) return declared
  if (source.includes("withAdminAuth")) return "admin_session"
  if (source.includes("authenticateAgentRequest")) return "agent_key"
  if (source.includes("withUserAuth") || source.includes("authenticateRequest")) return "user_session"
  if (source.includes("validateCronSecret")) return "cron_secret"
  if (source.includes("checkApiSecret") && source.includes("AIM_WORK_ITEM_API_SECRET")) return "signed_integration"
  if (/WEBHOOK_SECRET|WEBHOOK_TOKEN|VERIFICATION_TOKEN|x-obsidian-token/i.test(source)) return "signed_integration"
  if (route.startsWith("/api/webhook/") || route.startsWith("/api/integrations/")) return "integration_unverified"
  return "public"
}

function inputOf(source) {
  const declared = source.match(/api-inventory:\s*input=(zod_json|bounded_json_object|multipart|raw_body|query|none)\b/)?.[1]
  if (declared) return declared
  if (source.includes("parseJsonBody(")) return "zod_json"
  if (source.includes("parseJsonRecord(")) return "bounded_json_object"
  if (source.includes("request.formData(")) return "multipart"
  if (source.includes("request.arrayBuffer(") || source.includes("request.text(")) return "raw_body"
  if (source.includes("searchParams")) return "query"
  return "none"
}

function costOf(source) {
  if (/LLMClient|\.complete\(|generate[A-Z]|runCompetitorAnalysisPipeline|runAgentReach|createImage/i.test(source)) return "high"
  if (/fetch\(|collect[A-Z]|refresh|transcribe|transferFromUrl/i.test(source)) return "medium"
  return "low"
}

function routeFromFile(file) {
  const suffix = relative(apiRoot, file).replaceAll("\\", "/").replace(/\/route\.ts$/, "")
  return `/api/${suffix}`
}

const entries = walk(apiRoot).sort().map((file) => {
  const source = readFileSync(file, "utf8")
  const route = routeFromFile(file)
  return {
    route,
    file: relative(root, file).replaceAll("\\", "/"),
    methods: methodsOf(source),
    auth: authOf(source, route),
    input: inputOf(source),
    query: source.includes("parseQuery(")
      ? "zod"
      : source.includes("searchParams")
        ? "manual"
        : "none",
    externalService: /fetch\(|LLMClient|runAgentReach|collectDouyin|Tikhub|RedFox|Lark/i.test(source),
    cost: costOf(source),
    idempotency: /idempot|upsert|SET NX|"NX"|eventId|requestId.*unique/i.test(source),
  }
})

const directJson = entries.filter((entry) => readFileSync(join(root, entry.file), "utf8").includes("request.json()"))
if (directJson.length) {
  throw new Error(`API routes must use the bounded contract parser:\n${directJson.map((item) => item.file).join("\n")}`)
}

const swallowedContracts = entries.filter((entry) =>
  /parseJson(?:Record|Body)\(request[^\n]*\.catch/.test(readFileSync(join(root, entry.file), "utf8")),
)
if (swallowedContracts.length) {
  throw new Error(`API contract errors must not be swallowed:\n${swallowedContracts.map((item) => item.file).join("\n")}`)
}

const unboundedMultipart = entries.filter((entry) => {
  if (entry.input !== "multipart") return false
  const source = readFileSync(join(root, entry.file), "utf8")
  return !source.includes("enforceUploadSizeLimit")
    && !source.includes("INTERNAL_BETA_LIMITS.uploadBytes")
    && !source.includes("api-inventory: upload-limit=internal-beta")
})
if (unboundedMultipart.length) {
  throw new Error(`Multipart routes need an explicit upload limit:\n${unboundedMultipart.map((item) => item.file).join("\n")}`)
}

const unverifiedIntegrations = entries.filter((entry) => entry.auth === "integration_unverified")
if (unverifiedIntegrations.length) {
  throw new Error(`Integration routes need explicit authentication:\n${unverifiedIntegrations.map((item) => item.file).join("\n")}`)
}

const anonymousExpensive = entries.filter((entry) =>
  entry.auth === "public" && entry.cost === "high" && entry.methods.some((method) => method !== "GET"),
)
if (anonymousExpensive.length) {
  throw new Error(`Anonymous high-cost routes are forbidden:\n${anonymousExpensive.map((item) => item.file).join("\n")}`)
}

const document = `${JSON.stringify({ generatedBy: "scripts/api-inventory.mjs", routes: entries }, null, 2)}\n`
if (checkOnly) {
  const current = readFileSync(outputPath, "utf8")
  if (current !== document) throw new Error("API inventory is stale; run pnpm api:inventory")
  console.log(`api-contracts-ok routes=${entries.length}`)
} else {
  writeFileSync(outputPath, document)
  console.log(`api-inventory-written routes=${entries.length}`)
}
