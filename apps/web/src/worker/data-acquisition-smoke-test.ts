// apps/web/src/worker/data-acquisition-smoke-test.ts
//
// Validates the data-acquisition module wiring without making live API calls.
// Run: tsx src/worker/data-acquisition-smoke-test.ts

import { detectPlatform, extractUserId, parseUrl, getAdapter, DouyinAdapter, XiaohongshuAdapter } from '../lib/tikhub'

const PASS = '✓'
const FAIL = '✗'
let failures = 0

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ${PASS} ${label}`)
  } else {
    console.error(`  ${FAIL} ${label}`)
    failures++
  }
}

console.log('\n[data-acquisition-smoke-test] Module wiring validation\n')

// --- URL Parser ---
console.log('URL Parser:')
assert('detectPlatform(douyin.com) = douyin', detectPlatform('https://www.douyin.com/user/abc') === 'douyin')
assert('detectPlatform(iesdouyin.com) = douyin', detectPlatform('https://www.iesdouyin.com/share/user/abc') === 'douyin')
assert('detectPlatform(xiaohongshu.com) = xiaohongshu', detectPlatform('https://www.xiaohongshu.com/user/profile/abc') === 'xiaohongshu')
assert('detectPlatform(xhslink.com) = xiaohongshu', detectPlatform('https://xhslink.com/abc') === 'xiaohongshu')
assert('detectPlatform(unknown) = null', detectPlatform('https://example.com/user/abc') === null)
assert('detectPlatform(invalid) = null', detectPlatform('not-a-url') === null)

assert('extractUserId(douyin /user/abc) = abc', extractUserId('https://www.douyin.com/user/MS4wLjABAAAAtest') === 'MS4wLjABAAAAtest')
assert('extractUserId(xhs /user/profile/abc) = abc', extractUserId('https://www.xiaohongshu.com/user/profile/abc123') === 'abc123')
assert('extractUserId(no segment) = null', extractUserId('https://www.douyin.com/') === null)

const parsed = parseUrl('https://www.douyin.com/user/testid')
assert('parseUrl returns { platform: douyin, rawUserId: testid }', parsed?.platform === 'douyin' && parsed?.rawUserId === 'testid')

// --- Adapter Registry ---
console.log('\nAdapter Registry:')
const douyinAdapter = getAdapter('douyin')
assert('getAdapter(douyin) returns DouyinAdapter', douyinAdapter instanceof DouyinAdapter)
assert('DouyinAdapter has resolveUrl', typeof douyinAdapter.resolveUrl === 'function')
assert('DouyinAdapter has fetchAccount', typeof douyinAdapter.fetchAccount === 'function')
assert('DouyinAdapter has fetchVideos', typeof douyinAdapter.fetchVideos === 'function')
assert('DouyinAdapter has fetchVideoStats', typeof douyinAdapter.fetchVideoStats === 'function')
assert('DouyinAdapter has fetchComments', typeof douyinAdapter.fetchComments === 'function')

const xhsAdapter = getAdapter('xiaohongshu')
assert('getAdapter(xiaohongshu) returns XiaohongshuAdapter', xhsAdapter instanceof XiaohongshuAdapter)
assert('XiaohongshuAdapter has resolveUrl', typeof xhsAdapter.resolveUrl === 'function')
assert('XiaohongshuAdapter has fetchAccount', typeof xhsAdapter.fetchAccount === 'function')
assert('XiaohongshuAdapter has fetchVideos', typeof xhsAdapter.fetchVideos === 'function')
assert('XiaohongshuAdapter has fetchVideoStats', typeof xhsAdapter.fetchVideoStats === 'function')
assert('XiaohongshuAdapter has fetchComments', typeof xhsAdapter.fetchComments === 'function')

let bilibiliFailed = false
try { getAdapter('bilibili') } catch { bilibiliFailed = true }
assert('getAdapter(bilibili) throws unsupported', bilibiliFailed)

console.log(`\n[data-acquisition-smoke-test] ${failures === 0 ? 'ALL CHECKS PASSED' : `FAILED: ${failures} check(s) failed`}`)
process.exit(failures > 0 ? 1 : 0)
