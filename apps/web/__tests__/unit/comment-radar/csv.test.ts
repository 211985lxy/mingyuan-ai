import { describe, it, expect } from 'vitest'
import { generateCsv, sanitizeCsvCell } from '@/lib/comment-radar/csv'

describe('csv', () => {
  it('exports comments with UTF-8 BOM header', () => {
    const rows = [
      { commentId: 'c1', text: '你好世界', nickname: '用户1', likes: 10, createTime: '2024-01-01', isTop: true },
      { commentId: 'c2', text: 'test', nickname: 'user2', likes: 0, createTime: '2024-01-02', isTop: false },
    ]
    const csv = generateCsv(rows)
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('评论ID,评论内容,昵称,点赞数,评论时间,置顶')
    expect(csv).toContain('c1'); expect(csv).toContain('你好世界'); expect(csv).toContain('c2')
  })

  it('neutralizes formula injection by prefixing dangerous cells', () => {
    expect(sanitizeCsvCell('=CMD("x")')).toBe("'=CMD(\"x\")")
    expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe("'+SUM(A1:A10)")
    expect(sanitizeCsvCell('@IMPORT(url)')).toBe("'@IMPORT(url)")
    expect(sanitizeCsvCell('\tstarts with tab')).toBe("'\tstarts with tab")
    expect(sanitizeCsvCell('normal text')).toBe('normal text')
    expect(sanitizeCsvCell('')).toBe('')
  })

  it('escapes commas and quotes in CSV fields', () => {
    const rows = [{ commentId: 'c1', text: 'hello, "world"', nickname: 'user', likes: 0, createTime: '2024-01-01', isTop: false }]
    const csv = generateCsv(rows)
    expect(csv).toContain('"hello, ""world"""')
  })

  it('handles empty rows', () => {
    const csv = generateCsv([])
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    expect(csv).toContain('评论ID')
  })
})
