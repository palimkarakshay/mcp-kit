/**
 * Helpers for building successful tool results.
 *
 * The SDK types `structuredContent` as an open record, which named interfaces
 * (a typed API response shape) are not directly assignable to. This helper
 * centralises that one cast so handlers can return their domain types cleanly.
 * For failures, throw an {@link McpToolError} (see `./errors.ts`).
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Build a success result with a text summary and optional structured payload. */
export function toolResult(text: string, structuredContent?: unknown): CallToolResult {
  const result: CallToolResult = { content: [{ type: "text", text }] };
  if (structuredContent !== undefined) {
    result.structuredContent = structuredContent as Record<string, unknown>;
  }
  return result;
}
