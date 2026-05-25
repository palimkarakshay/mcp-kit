#!/usr/bin/env node
/**
 * SQL MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio node dist/cli.js                 # seeded in-memory demo
 *   SQLITE_PATH=/data/app.db MCP_TRANSPORT=stdio node dist/cli.js   # real DB (read-only)
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./sql.tools.js";

serveFromEnv({
  name: "mcp-recipe-sql",
  version: "0.1.0",
  instructions:
    "Read-only access to a SQL database. Set SQLITE_PATH to point at a SQLite file (opened read-only), or omit it for a seeded demo database.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
