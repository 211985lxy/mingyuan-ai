/**
 * CSV 导出模块。
 * UTF-8 BOM、RFC 4180 转义、公式注入防护。
 */

const CSV_HEADER = '评论ID,评论内容,昵称,点赞数,评论时间,置顶'

export interface CsvRow {
  commentId: string
  text: string
  nickname: string | null
  likes: number
  createTime: string
  isTop: boolean
}

/**
 * 防护电子表格公式注入。
 * 对以 = + - @ \t 开头的单元格前加单引号。
 */
export function sanitizeCsvCell(value: string): string {
  if (!value) return value
  const first = value.charCodeAt(0)
  if (first === 0x3D || first === 0x2B || first === 0x2D || first === 0x40 || first === 0x09) return "'" + value
  return value
}

/** RFC 4180 转义：含逗号/引号/换行的字段用双引号包裹 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

/**
 * 生成带 UTF-8 BOM 的 CSV 字符串。
 */
export function generateCsv(rows: CsvRow[]): string {
  const BOM = '\uFEFF'
  const lines: string[] = [CSV_HEADER]
  for (const row of rows) {
    const fields = [
      escapeField(row.commentId),
      escapeField(sanitizeCsvCell(row.text)),
      escapeField(row.nickname ?? ''),
      String(row.likes),
      escapeField(row.createTime),
      row.isTop ? '是' : '否',
    ]
    lines.push(fields.join(','))
  }
  return BOM + lines.join('\n') + '\n'
}
