import { env } from "@/env"
/**
 * TikHub smoke test — run with:
 *   DOTENV_CONFIG_PATH=.env NODE_OPTIONS='-r dotenv/config' \
 *   tsx --tsconfig tsconfig.json src/worker/tikhub-smoke-test.ts
 *
 * Success: prints the user balance response and exits 0
 * Failure: prints the error and exits 1
 */
import { tikhubGet, TikHubError } from '@/lib/tikhub/client'

interface UserBalanceResponse {
  balance: number | string;
  [key: string]: unknown;
}

async function main() {
  console.log('[tikhub-smoke-test] Testing TikHub API connectivity...')
  console.log(`[tikhub-smoke-test] Base URL: ${env.TIKHUB_BASE_URL || 'https://api.tikhub.io'}`)
  console.log(`[tikhub-smoke-test] API Key set: ${env.TIKHUB_API_KEY ? 'yes' : 'NO — set TIKHUB_API_KEY'}`)

  try {
    const data = await tikhubGet<UserBalanceResponse>('/api/v1/user/balance')
    console.log('[tikhub-smoke-test] SUCCESS — Response:')
    console.log(JSON.stringify(data, null, 2))
    process.exit(0)
  } catch (err) {
    if (err instanceof TikHubError) {
      console.error(`[tikhub-smoke-test] FAILED — TikHubError: ${err.message}`)
      console.error(`  endpoint: ${err.endpoint}`)
      console.error(`  statusCode: ${err.statusCode}`)
    } else {
      console.error('[tikhub-smoke-test] FAILED — Unexpected error:', err)
    }
    process.exit(1)
  }
}

main()
