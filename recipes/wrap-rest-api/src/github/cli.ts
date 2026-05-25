#!/usr/bin/env node
/**
 * GitHub MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio node dist/github/cli.js
 *   GITHUB_TOKEN=ghp_... MCP_TRANSPORT=http node dist/github/cli.js
 *
 * `GITHUB_TOKEN` is optional and read from the environment — it is never a
 * tool argument.
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./github.tools.js";

serveFromEnv({
  name: "mcp-recipe-github",
  version: "0.1.0",
  instructions:
    "Wraps the public GitHub REST API. Read-only repo and issue lookups. Set GITHUB_TOKEN in the environment to raise rate limits.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
