/**
 * Structured errors for MCP tools.
 *
 * A tool must never leak a raw stack trace or an opaque `[object Object]` back
 * to the model — that is unusable documentation. Instead every failure is
 * shaped into a stable {@link ErrorEnvelope}: a machine-readable `code`, a
 * human-readable `message`, and a `retryable` flag the model can act on. The
 * envelope is returned as `structuredContent` alongside an `isError: true`
 * tool result, so the model sees both prose and structure.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Stable, low-cardinality error codes. Add to this union deliberately. */
export type ErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "not_found"
  | "upstream_error"
  | "upstream_unavailable"
  | "timeout"
  | "rate_limited"
  | "internal";

/** The structured payload returned to the model on failure. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    /** `true` if retrying the same call could plausibly succeed. */
    retryable: boolean;
    /** Optional, already-sanitised extra context (never secrets/stack traces). */
    details?: unknown;
  };
}

export interface McpToolErrorOptions {
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

/**
 * An error a tool can throw to produce a well-formed {@link ErrorEnvelope}.
 *
 * Throw this from a tool handler (or let a helper below throw it); the
 * {@link wrapHandler} wrapper converts it into a structured `CallToolResult`.
 */
export class McpToolError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, options: McpToolErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "McpToolError";
    this.code = code;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[code];
    this.details = options.details;
  }

  toEnvelope(): ErrorEnvelope {
    const error: ErrorEnvelope["error"] = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  invalid_input: false,
  unauthorized: false,
  not_found: false,
  upstream_error: false,
  upstream_unavailable: true,
  timeout: true,
  rate_limited: true,
  internal: false,
};

/** The caller passed something the tool cannot accept. Not retryable. */
export function invalidInput(message: string, details?: unknown): McpToolError {
  return new McpToolError("invalid_input", message, { details });
}

/** A referenced resource does not exist. Not retryable. */
export function notFound(message: string, details?: unknown): McpToolError {
  return new McpToolError("not_found", message, { details });
}

/** An upstream dependency returned an error response. */
export function upstreamError(
  message: string,
  options: McpToolErrorOptions = {},
): McpToolError {
  return new McpToolError("upstream_error", message, options);
}

/** An operation exceeded its deadline. Retryable. */
export function timeout(message: string, details?: unknown): McpToolError {
  return new McpToolError("timeout", message, { details, retryable: true });
}

/**
 * Convert any thrown value into a structured, model-safe tool result.
 *
 * Known {@link McpToolError}s pass through their envelope verbatim. Anything
 * else is mapped to an `internal` error with only its message exposed — never
 * a stack trace, which would be noise (and a possible information leak) to the
 * model.
 */
export function errorResult(thrown: unknown): CallToolResult {
  const envelope = toEnvelope(thrown);
  return {
    isError: true,
    content: [{ type: "text", text: formatEnvelope(envelope) }],
    structuredContent: envelope as unknown as Record<string, unknown>,
  };
}

function toEnvelope(thrown: unknown): ErrorEnvelope {
  if (thrown instanceof McpToolError) return thrown.toEnvelope();
  if (thrown instanceof Error) {
    return { error: { code: "internal", message: thrown.message, retryable: false } };
  }
  return { error: { code: "internal", message: String(thrown), retryable: false } };
}

function formatEnvelope(envelope: ErrorEnvelope): string {
  const { code, message, retryable } = envelope.error;
  return `[${code}] ${message}${retryable ? " (retryable)" : ""}`;
}
