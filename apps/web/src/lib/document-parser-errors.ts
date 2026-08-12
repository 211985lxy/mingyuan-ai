export class DocumentParseError extends Error {
  status: number
  code: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = "DocumentParseError"
    this.status = options?.status ?? 422
    this.code = options?.code ?? "PARSE_FAILED"
  }
}
