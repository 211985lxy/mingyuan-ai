import type { CommentRadarPlatform, ResolvedSource } from './types'
const DD = ['douyin.com', 'iesdouyin.com', 'v.douyin.com']
const XD = ['xiaohongshu.com', 'xhslink.com', 'xhs.cn']
const SL = new Set(['v.douyin.com', 'xhslink.com', 'xhs.cn'])
function pureUrl(d: string): string | null { if (!d?.trim()) return null; const m = d.trim().match(/(https?:\/\/[^\s\u4e00-\u9fff]+)/i); return m ? m[1].replace(/[，。；！、""''\"'\]\}\)]+$/, '') : null }
function plat(u: string): CommentRadarPlatform | null { const l = u.toLowerCase(); if (DD.some(d => l.includes(d))) return 'douyin'; if (XD.some(d => l.includes(d))) return 'xiaohongshu'; return null }
function short(u: string): boolean { try { return SL.has(new URL(u).hostname.toLowerCase()) } catch { return false } }
function extract(platform: CommentRadarPlatform, url: string) {
  try {
    const p = new URL(url).pathname
    if (platform === 'douyin') { let m = p.match(/\/video\/([\w]+)/); if (m) return { t: 'video' as const, id: m[1] }; m = p.match(/\/note\/([\w]+)/); if (m) return { t: 'video' as const, id: m[1] }; m = p.match(/\/user\/([\w]+)/); if (m) return { t: 'account' as const, id: null as string | null } }
    if (platform === 'xiaohongshu') { let m = p.match(/\/explore\/([\w]+)/); if (m) return { t: 'video' as const, id: m[1] }; m = p.match(/\/discovery\/item\/([\w]+)/); if (m) return { t: 'video' as const, id: m[1] }; m = p.match(/\/notes\/([\w]+)/); if (m) return { t: 'video' as const, id: m[1] }; m = p.match(/\/user\/profile\/([\w]+)/); if (m) return { t: 'account' as const, id: null as string | null } }
  } catch {}
  return null
}
export function resolveSource(raw: string, vl = 20): ResolvedSource | null {
  const u = pureUrl(raw); if (!u) return null; const p = plat(u); if (!p) return null
  if (short(u)) return { platform: p, sourceType: 'unknown', itemId: null, videoLimit: vl, rawUrl: u }
  const e = extract(p, u); if (!e) return null
  return { platform: p, sourceType: e.t, itemId: e.id, videoLimit: e.t === 'video' ? 1 : vl, rawUrl: u }
}
