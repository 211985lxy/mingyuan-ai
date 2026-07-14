import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z, type ZodType } from "zod"

const jsonRecordSchema = z.record(z.string(), z.unknown())

// Transitional shape for routes that already perform field-by-field checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonRecord = Record<string, any>

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? 64 * 1024
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiRequestError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`)
  }

  const text = await request.text()
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiRequestError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes`)
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new ApiRequestError(400, "INVALID_JSON", "Request body must be valid JSON")
  }

  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ApiRequestError(
      400,
      "INVALID_REQUEST",
      issue?.message ?? "Request body is invalid",
      issue?.path.join(".") || undefined,
    )
  }
  return result.data
}

export function parseJsonRecord(
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<JsonRecord> {
  // Preserves request.json() field compatibility while adding object, size, and
  // malformed-JSON checks. Critical routes use a domain Zod schema instead.
  return parseJsonBody(request, jsonRecordSchema, options)
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = new URL(request.url).searchParams
  const input: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    input[key] = values.length > 1 ? values : values[0]
  }
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ApiRequestError(
      400,
      "INVALID_QUERY",
      issue?.message ?? "Query parameters are invalid",
      issue?.path.join(".") || undefined,
    )
  }
  return result.data
}

export function apiRequestErrorResponse(
  request: Request | undefined,
  error: unknown,
): NextResponse | null {
  if (!(error instanceof ApiRequestError)) return null
  const requestId = request?.headers.get("x-request-id") || randomUUID()
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      message: error.message,
      requestId,
      ...(error.field ? { field: error.field } : {}),
    },
    { status: error.status, headers: { "x-request-id": requestId } },
  )
}
