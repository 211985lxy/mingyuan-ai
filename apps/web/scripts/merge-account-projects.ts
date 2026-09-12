/**
 * Safely preview or apply a project merge through the transactional domain service.
 *
 * The CLI is read-only unless every apply safeguard is supplied, including the
 * directional `source->target` confirmation. Database behavior stays in the
 * project-merge service and Prisma store.
 */
import { pathToFileURL } from "node:url"

import { prismaProjectMergeStore } from "@/features/projects/services/project-merge-prisma-store"
import {
  applyProjectMerge,
  previewProjectMerge,
  type ProjectMergeIdentity,
  type ProjectMergeInput,
  type ProjectMergeStore,
} from "@/features/projects/services/project-merge-service"

interface DryRunArgs extends ProjectMergeIdentity {
  apply: false
}

interface ApplyArgs extends ProjectMergeInput {
  apply: true
}

export type ProjectMergeArgs = DryRunArgs | ApplyArgs

interface ProjectMergeCliDependencies {
  previewProjectMerge(
    input: ProjectMergeIdentity,
    store: ProjectMergeStore,
  ): Promise<unknown>
  applyProjectMerge(
    input: ProjectMergeInput,
    store: ProjectMergeStore,
  ): Promise<unknown>
}

const defaultDependencies: ProjectMergeCliDependencies = {
  previewProjectMerge,
  applyProjectMerge,
}

function option(argv: string[], name: string): string | null {
  const index = argv.indexOf(name)
  if (index < 0) return null
  const value = argv[index + 1]
  return value && !value.startsWith("--") ? value : null
}

function requireOption(argv: string[], name: string): string {
  const value = option(argv, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function parseProjectMergeArgs(argv: string[]): ProjectMergeArgs {
  const sourceProjectId = requireOption(argv, "--source-project")
  const targetProjectId = requireOption(argv, "--target-project")
  if (sourceProjectId === targetProjectId) {
    throw new Error("source and target projects must differ")
  }

  const apply = argv.includes("--apply")
  if (!apply) return { apply: false, sourceProjectId, targetProjectId }

  const expectedConfirmation = `${sourceProjectId}->${targetProjectId}`
  const confirmation = option(argv, "--confirm")
  if (confirmation !== expectedConfirmation) {
    throw new Error(`--confirm ${expectedConfirmation} is required for apply`)
  }

  return {
    apply: true,
    sourceProjectId,
    targetProjectId,
    expectedSourceOwnerId: requireOption(argv, "--source-owner"),
    expectedTargetOwnerId: requireOption(argv, "--target-owner"),
    adminUserId: requireOption(argv, "--admin-id"),
    reason: requireOption(argv, "--reason"),
    requestId: requireOption(argv, "--request-id"),
    confirmation,
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted-url]")
    .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=[redacted]")
}

export async function main(
  argv = process.argv.slice(2),
  dependencies: ProjectMergeCliDependencies = defaultDependencies,
): Promise<0 | 1> {
  try {
    const args = parseProjectMergeArgs(argv)
    let result: unknown
    if (args.apply) {
      const serviceInput: ProjectMergeInput = {
        sourceProjectId: args.sourceProjectId,
        targetProjectId: args.targetProjectId,
        expectedSourceOwnerId: args.expectedSourceOwnerId,
        expectedTargetOwnerId: args.expectedTargetOwnerId,
        adminUserId: args.adminUserId,
        reason: args.reason,
        requestId: args.requestId,
        confirmation: args.confirmation,
      }
      result = await dependencies.applyProjectMerge(serviceInput, prismaProjectMergeStore)
    } else {
      const serviceInput: ProjectMergeIdentity = {
        sourceProjectId: args.sourceProjectId,
        targetProjectId: args.targetProjectId,
      }
      result = await dependencies.previewProjectMerge(serviceInput, prismaProjectMergeStore)
    }
    console.log(JSON.stringify(result))
    return 0
  } catch (error) {
    console.error("project merge failed:", safeErrorMessage(error))
    process.exitCode = 1
    return 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main()
}
