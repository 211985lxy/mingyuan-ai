/**
 * AIM chat context service — re-export facade.
 *
 * All logic has been split into sub-modules under ./chat/:
 *   request.ts           – body parsing, message normalization
 *   context-loaders.ts   – knowledge/style/competitor/editor/memory retrieval
 *   context-assembly.ts  – intent resolution → block assembly → manifest
 *   tool-actions.ts      – Lark tool-action branch
 *   execution.ts         – harness parameter preparation
 *   responses.ts         – streaming & JSON response construction
 *
 * This file keeps the original export surface so existing consumers
 * (api/aim/chat/route.ts) continue to work without changes.
 */
export {
  extractTextContent,
  normalizeMemoryMessages,
  parseAimChatBody,
  type AimChatRequestBody,
} from "./chat/request"

export { assembleAimChatContext, type AssembledAimChatContext } from "./chat/context-assembly"

export { handleToolActionBranch } from "./chat/tool-actions"

export {
  prepareAimChatExecution,
  type AimChatExecutionInput,
} from "./chat/execution"

export {
  streamChatContent,
  buildAimChatStreamResponse,
  buildAimChatJsonResponse,
} from "./chat/responses"
