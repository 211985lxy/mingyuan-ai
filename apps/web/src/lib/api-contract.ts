import { randomUUID } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import type { ZodType } from "zod"

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
  request: NextRequest,
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

export function apiRequestErrorResponse(
  request: NextRequest,
  error: unknown,
): NextResponse | null {
  if (!(error instanceof ApiRequestError)) return null
  const requestId = request.headers.get("x-request-id") || randomUUID()
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
