#!/usr/bin/env node
/**
 * Anaplan MCP server entry point. Needs a real tenant.
 *
 *   MCP_TRANSPORT=stdio \
 *   ANAPLAN_EMAIL=... ANAPLAN_PASSWORD=... \
 *   ANAPLAN_WORKSPACE_ID=... ANAPLAN_MODEL_ID=... \
 *   node dist/anaplan/cli.js
 *
 * All credentials and the workspace/model are read from the environment — none
 * are tool arguments.
 *
 * **Read-only by default.** Anaplan's terms restrict programmatic/agent use of
 * the Integration API, so this server ships read-only: only the discovery tool
 * (`list_anaplan_actions`) is registered. The mutating `run_*` tools are
 * disabled until you opt in with `--allow-writes` (or `ANAPLAN_ALLOW_WRITES=1`),
 * which is your responsibility under Anaplan's terms. See
 * `docs/auth-patterns.md` → "Anaplan caveat".
 */
import { serveFromEnv, type AnyToolSpec } from "@mcp-kit/core";

import { tools } from "./anaplan.tools.js";

const truthy = (v: string | undefined): boolean =>
  v !== undefined && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());

const writesRequested =
  process.argv.slice(2).some((a) => a === "--allow-writes" || a === "--no-read-only") ||
  truthy(process.env.ANAPLAN_ALLOW_WRITES);

const readOnly = !writesRequested;

// In read-only mode, register only tools the lint marks `readOnlyHint`.
const selected: readonly AnyToolSpec[] = readOnly
  ? tools.filter((t) => t.annotations?.readOnlyHint === true)
  : tools;

function banner(): void {
  const line = "=".repeat(64);
  const blocked = tools
    .filter((t) => t.annotations?.readOnlyHint !== true)
    .map((t) => t.name)
    .join(", ");
  console.error(line);
  console.error(" mcp-recipe-anaplan — Anaplan Integration API v2 wrapper");
  if (readOnly) {
    console.error(" MODE: READ-ONLY (default).");
    console.error(`   exposed: ${selected.map((t) => t.name).join(", ")}`);
    console.error(`   disabled: ${blocked}`);
    console.error(" Anaplan's terms restrict programmatic/agent use of the");
    console.error(" Integration API. Review them before enabling writes:");
    console.error("   enable (your ToS responsibility): --allow-writes");
  } else {
    console.error(" MODE: WRITES ENABLED (--allow-writes).");
    console.error(`   run_* tools can mutate your model: ${blocked}`);
    console.error(" Ensure this complies with Anaplan's terms of service.");
  }
  console.error(" See docs/auth-patterns.md → \"Anaplan caveat\".");
  console.error(line);
}

banner();

serveFromEnv({
  name: "mcp-recipe-anaplan",
  version: "0.1.0",
  instructions:
    "Wraps the Anaplan Integration API v2: run imports, exports and processes as async tasks. Configure ANAPLAN_* in " +
    "the environment. Read-only by default (only list_anaplan_actions); pass --allow-writes to enable run_* tools, " +
    "subject to Anaplan's terms of service.",
  tools: selected,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
