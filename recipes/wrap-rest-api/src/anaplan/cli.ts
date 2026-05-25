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
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./anaplan.tools.js";

serveFromEnv({
  name: "mcp-recipe-anaplan",
  version: "0.1.0",
  instructions:
    "Wraps the Anaplan Integration API v2: run imports, exports and processes as async tasks. Configure ANAPLAN_* in the environment.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
