import { createEnv } from "@t3-oss/env-nextjs"
import { clientSchema } from "@/lib/env/client"
import { runtimeEnvSchema } from "@/lib/env/runtime"
import { serverSchema } from "@/lib/env/server"

// Feature-specific values are optional here. The consuming boundary must reject
// a missing value when that integration is enabled, rather than failing unrelated routes.
export const env = createEnv({
  server: serverSchema,
  client: clientSchema,
  runtimeEnv: runtimeEnvSchema,
  emptyStringAsUndefined: true,
})
// Provider key pools and child-process inheritance need dynamic names or the
// complete process map. Keep those two escape hatches centralized here.
/** 按前缀+序号读取索引化环境变量值（如 PROVIDER_1、PROVIDER_2）。 */
export function getIndexedEnvironmentValue(prefix: string, index: number): string | undefined {
  return process.env[`${prefix}_${index}`]?.trim() || undefined
}

export function getProcessEnvironment(): NodeJS.ProcessEnv {
  return process.env
}
