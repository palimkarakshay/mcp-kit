/**
 * Anaplan tools — the enterprise, credential-exchange half of the recipe.
 *
 * Exposes import / export / process as MCP tools, plus a discovery tool to find
 * action ids. Workspace, model and credentials are read from the environment
 * (auth at the transport); the model only ever passes action ids, never secrets.
 */
import { McpToolError, type AnyToolSpec, defineTool, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { AnaplanClient, type AnaplanResource, type TaskStatus } from "./client.js";

let injected: AnaplanClient | undefined;

/** Override the client (tests). */
export function setAnaplanClient(client: AnaplanClient | undefined): void {
  injected = client;
}

function anaplan(): AnaplanClient {
  if (injected) return injected;
  const email = process.env.ANAPLAN_EMAIL;
  const password = process.env.ANAPLAN_PASSWORD;
  const workspaceId = process.env.ANAPLAN_WORKSPACE_ID;
  const modelId = process.env.ANAPLAN_MODEL_ID;
  if (!email || !password || !workspaceId || !modelId) {
    throw new McpToolError(
      "unauthorized",
      "Anaplan is not configured. Set ANAPLAN_EMAIL, ANAPLAN_PASSWORD, ANAPLAN_WORKSPACE_ID and ANAPLAN_MODEL_ID in the environment.",
    );
  }
  injected = new AnaplanClient({ credentials: { email, password }, workspaceId, modelId });
  return injected;
}

function summarise(status: TaskStatus): { taskState: string; successful: boolean; result: unknown } {
  return {
    taskState: status.taskState ?? "UNKNOWN",
    successful: status.result?.successful !== false,
    result: status.result ?? null,
  };
}

const runImport = defineTool({
  name: "run_anaplan_import",
  title: "Run Anaplan import",
  description:
    "Run a pre-configured Anaplan import action by its id and wait for it to finish. " +
    "Use this when a model already has an import action defined (a mapping from a source file to a module/list) " +
    "and you want to execute it now and learn the outcome: it starts the action, polls the async task until it is " +
    "COMPLETE, and reports success or the failure dump. " +
    "It does not create or edit import actions and does not upload a local file first — the import reads whatever " +
    "file the action is bound to. Discover ids with list_anaplan_actions. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: run_anaplan_import({ "import_id": "112000000012" }).',
  inputSchema: {
    import_id: z.string().min(1).describe("The id of an existing import action in the configured model."),
  },
  outputSchema: {
    taskState: z.string().describe('Final task state, normally "COMPLETE".'),
    successful: z.boolean().describe("Whether the import succeeded."),
    result: z.unknown().describe("The raw Anaplan result block (row counts, failure dump, …)."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  examples: [{ description: "Run an import action by id.", arguments: { import_id: "112000000012" } }],
  handler: async (args) => {
    const status = await anaplan().runImport(args.import_id);
    const summary = summarise(status);
    return toolResult(`Import ${args.import_id}: ${summary.taskState} (successful=${summary.successful}).`, summary);
  },
});

const runExport = defineTool({
  name: "run_anaplan_export",
  title: "Run Anaplan export",
  description:
    "Run a pre-configured Anaplan export action by its id and wait for it to finish. " +
    "Use this when you want a model to produce its export output (e.g. regenerate a CSV the export action defines) " +
    "and need to know it completed: it starts the export, polls until COMPLETE, and reports the result. " +
    "It does not download the produced file's bytes and does not define exports; downloading is a separate, chunked " +
    "step. Discover ids with list_anaplan_actions. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: run_anaplan_export({ "export_id": "116000000007" }).',
  inputSchema: {
    export_id: z.string().min(1).describe("The id of an existing export action in the configured model."),
  },
  outputSchema: {
    taskState: z.string().describe('Final task state, normally "COMPLETE".'),
    successful: z.boolean().describe("Whether the export succeeded."),
    result: z.unknown().describe("The raw Anaplan result block."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  examples: [{ description: "Run an export action by id.", arguments: { export_id: "116000000007" } }],
  handler: async (args) => {
    const status = await anaplan().runExport(args.export_id);
    const summary = summarise(status);
    return toolResult(`Export ${args.export_id}: ${summary.taskState} (successful=${summary.successful}).`, summary);
  },
});

const runProcess = defineTool({
  name: "run_anaplan_process",
  title: "Run Anaplan process",
  description:
    "Run an Anaplan process (an ordered group of actions) by its id and wait for it to finish. " +
    "Use this when several actions must run together in sequence — the common production entry point — and you want " +
    "the rolled-up outcome: it starts the process, polls until COMPLETE, and reports whether every contained action " +
    "succeeded. " +
    "It does not run a single action in isolation (use run_anaplan_import / run_anaplan_export for that) and does not " +
    "edit the process. Discover ids with list_anaplan_actions. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: run_anaplan_process({ "process_id": "118000000005" }).',
  inputSchema: {
    process_id: z.string().min(1).describe("The id of an existing process in the configured model."),
  },
  outputSchema: {
    taskState: z.string().describe('Final task state, normally "COMPLETE".'),
    successful: z.boolean().describe("Whether the whole process succeeded."),
    result: z.unknown().describe("The raw Anaplan result block, rolling up each action."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  examples: [{ description: "Run a process by id.", arguments: { process_id: "118000000005" } }],
  handler: async (args) => {
    const status = await anaplan().runProcess(args.process_id);
    const summary = summarise(status);
    return toolResult(`Process ${args.process_id}: ${summary.taskState} (successful=${summary.successful}).`, summary);
  },
});

const listActions = defineTool({
  name: "list_anaplan_actions",
  title: "List Anaplan actions",
  description:
    "List the runnable items in the configured Anaplan model so you can find an id to run. " +
    "Use this first whenever you do not already know an action's id — it returns the ids and names for the requested " +
    "kind so you can pass one to run_anaplan_import / run_anaplan_export / run_anaplan_process. " +
    "It does not run anything and does not return action definitions, mappings, or file contents. " +
    "Part of the wrap-rest-api server (a REST-API wrapper), not a primitive. " +
    'Example: list_anaplan_actions({ "kind": "processes" }).',
  inputSchema: {
    kind: z
      .enum(["imports", "exports", "processes", "actions"])
      .describe('Which kind of runnable to list. Defaults to "processes".')
      .default("processes"),
  },
  outputSchema: {
    kind: z.string().describe("The kind that was listed."),
    count: z.number().describe("Number of items returned."),
    items: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .describe("Each runnable's id and display name."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  examples: [
    { description: "List processes (the default).", arguments: {} },
    { description: "List import actions.", arguments: { kind: "imports" } },
  ],
  handler: async (args) => {
    const items = await anaplan().listResource(args.kind as AnaplanResource);
    return toolResult(`${items.length} ${args.kind} in the configured model.`, {
      kind: args.kind,
      count: items.length,
      items,
    });
  },
});

export const tools: AnyToolSpec[] = [runImport, runExport, runProcess, listActions];
