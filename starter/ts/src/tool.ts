/**
 * The typed tool helper.
 *
 * A {@link ToolSpec} is the single source of truth for a tool: its name,
 * description, input schema, annotations and worked examples. The *same*
 * object is consumed twice —
 *
 *  1. by {@link registerTool} to wire the tool into an MCP server, and
 *  2. by the tool-description lint (`@mcp-kit/lint`) to score its docs.
 *
 * Keeping one object for both means the thing the model reads and the thing
 * the lint grades can never drift apart.
 */
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";

import { errorResult } from "./errors.js";

/** A worked example: what calling the tool with these arguments demonstrates. */
export interface ToolExample {
  /** One line on *why* you would make this call. */
  description: string;
  /** Concrete arguments, matching the tool's input schema. */
  arguments: Record<string, unknown>;
}

/**
 * A complete, lint-gradeable tool definition.
 *
 * @typeParam InputShape - a Zod raw shape (an object of Zod schemas). Give
 * every field a `.describe(...)` — the lint requires it, and it is the only
 * per-parameter documentation the model ever sees.
 */
export interface ToolSpec<InputShape extends ZodRawShape = ZodRawShape> {
  /** Verb-first, `snake_case`, unique within the server. e.g. `get_repo`. */
  name: string;
  /** Optional human-friendly title for UIs. */
  title?: string;
  /**
   * The model's documentation for this tool. A good one names: what it
   * operates on, a "Use this when …" sentence, and what it does *not* handle.
   */
  description: string;
  /** Zod raw shape; each field `.describe(...)`'d. */
  inputSchema: InputShape;
  /** Optional Zod raw shape describing `structuredContent` on success. */
  outputSchema?: ZodRawShape;
  /** Behavioural hints (`readOnlyHint`, `idempotentHint`, …). */
  annotations?: ToolAnnotations;
  /** At least one worked example. Examples are part of the documentation. */
  examples?: ToolExample[];
  /** Runs when the tool is called. Throw {@link McpToolError} for clean failures. */
  handler: ToolCallback<InputShape>;
}

/** A tool spec with its input shape erased — for heterogeneous registries. */
// `any` is deliberate: a list of differently-shaped tools cannot share one
// concrete generic, and the consumers here only read name/description/schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolSpec = ToolSpec<any>;

/**
 * Identity helper that pins the generic so `handler` args are fully typed from
 * `inputSchema`. Authoring sugar — `defineTool({ ... })`.
 */
export function defineTool<InputShape extends ZodRawShape>(
  spec: ToolSpec<InputShape>,
): ToolSpec<InputShape> {
  return spec;
}

/**
 * Wrap a handler so any thrown value becomes a structured error result instead
 * of crashing the request. This is what makes "just `throw invalidInput(...)`"
 * the ergonomic, correct way to fail.
 */
function wrapHandler(handler: ToolCallback<ZodRawShape>): ToolCallback<ZodRawShape> {
  const wrapped = async (...args: unknown[]): Promise<CallToolResult> => {
    try {
      return await (handler as (...a: unknown[]) => CallToolResult | Promise<CallToolResult>)(
        ...args,
      );
    } catch (err) {
      return errorResult(err);
    }
  };
  return wrapped as unknown as ToolCallback<ZodRawShape>;
}

/** Register a single {@link ToolSpec} on an MCP server. */
export function registerTool(server: McpServer, spec: AnyToolSpec): void {
  const config: {
    title?: string;
    description: string;
    inputSchema: ZodRawShape;
    outputSchema?: ZodRawShape;
    annotations?: ToolAnnotations;
  } = {
    description: spec.description,
    inputSchema: spec.inputSchema,
  };
  if (spec.title !== undefined) config.title = spec.title;
  if (spec.outputSchema !== undefined) config.outputSchema = spec.outputSchema;
  if (spec.annotations !== undefined) config.annotations = spec.annotations;

  server.registerTool(spec.name, config, wrapHandler(spec.handler as ToolCallback<ZodRawShape>));
}

/** Register many specs at once. */
export function registerTools(server: McpServer, specs: readonly AnyToolSpec[]): void {
  for (const spec of specs) registerTool(server, spec);
}
