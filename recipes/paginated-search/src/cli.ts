#!/usr/bin/env node
/**
 * Paginated-search MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio node dist/cli.js
 *   MCP_TRANSPORT=http  node dist/cli.js
 *
 * Serves a fixed in-memory product catalog. No environment variables are
 * required and no tool argument is ever a credential.
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./search.tools.js";

serveFromEnv({
  name: "mcp-recipe-search",
  version: "0.1.0",
  instructions:
    "Demonstrates cursor-based pagination over a fixed product catalog. search_records returns one page plus an opaque next_cursor; pass that back as cursor to page through results until next_cursor is null. get_record fetches a single item by id.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
