#!/usr/bin/env node
/**
 * Long-running-job MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio node dist/cli.js
 *   MCP_TRANSPORT=http  node dist/cli.js
 *
 * Pure in-memory: jobs live in this process and are gone when it exits. No
 * environment variables are required and no tool argument is ever a credential.
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./jobs.tools.js";

serveFromEnv({
  name: "mcp-recipe-jobs",
  version: "0.1.0",
  instructions:
    "Demonstrates the async + polling pattern: start_job returns a job id immediately, then poll get_job_status until it succeeds, or cancel_job to stop it. list_jobs gives an overview. Jobs are simulated in memory.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
