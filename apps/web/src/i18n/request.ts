import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

const SUPPORTED_LOCALES = new Set(["zh", "en"])

function normalizeLocale(locale: string | undefined) {
  if (!locale) {
    return "zh"
  }

  const normalized = locale.toLowerCase().replace("_", "-")

  if (normalized.startsWith("zh")) {
    return "zh"
  }

  if (SUPPORTED_LOCALES.has(normalized)) {
    return normalized
  }

  return "zh"
}

export default getRequestConfig(async () => {
  const store = await cookies()
  const locale = normalizeLocale(store.get("locale")?.value)

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
