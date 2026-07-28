import { runLarkCliCommand } from "@/lib/integrations/lark-cli-runner"

type EnsureEmbeddingFn = (entryId: string) => Promise<void>
let ensureEmbedding: EnsureEmbeddingFn | null = null

export type LarkTableType = "topic_review" | "project_management" | "data_archive"
export type LarkResultType = "topic" | "script" | "positioning" | "moments_copy"
type LarkCommand = "+table-get" | "+field-list" | "+record-list" | "+record-get" | "+record-upsert"

export type RunCommand = (command: LarkCommand, args: string[]) => Promise<unknown>
export type EnvLike = Record<string, string | undefined>

export type LarkConfig = {
  cliPath?: string
  baseToken: string
  tableId: string
}

export type DbLike = {
  clientProject: {
    findFirst(args: unknown): Promise<{ id: string; name?: string | null } | null>
  }
  knowledgeEntry: {
    findFirst(args: unknown): Promise<{ id: string } | null>
    update(args: unknown): Promise<{ id: string } & Record<string, unknown>>
    create(args: unknown): Promise<{ id: string } & Record<string, unknown>>
  }
  aimGeneration?: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
  topicSelection?: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
}

/** Optional: register an embedding hook that runs after entry create/update. */
export function setEmbeddingHook(fn: EnsureEmbeddingFn): void {
  ensureEmbedding = fn
}

export function fireEmbedding(entryId: string): void {
  ensureEmbedding?.(entryId).catch(() => {})
}

/**
 * Execute a Lark Base command through the shared CLI runner.
 */
export async function runLarkBaseCommand(
  command: string,
  args: string[],
  options: {
    cliPath?: string
    identity?: "user" | "bot"
    runner?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  } = {},
): Promise<unknown> {
  return runLarkCliCommand({
    domain: "base",
    command,
    args,
    identity: options.identity,
    runner: options.runner,
    cliPath: options.cliPath,
    timeoutMs: 15_000,
  })
}
