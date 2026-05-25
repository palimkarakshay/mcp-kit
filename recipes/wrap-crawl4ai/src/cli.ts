#!/usr/bin/env node
/**
 * Crawl4AI MCP server entry point.
 *
 *   MCP_TRANSPORT=stdio CRAWL4AI_BASE_URL=http://127.0.0.1:11235 node dist/cli.js
 *   CRAWL4AI_API_TOKEN=... MCP_TRANSPORT=http node dist/cli.js
 *
 * `CRAWL4AI_BASE_URL` and `CRAWL4AI_API_TOKEN` are read from the environment —
 * they are never tool arguments.
 */
import { serveFromEnv } from "@mcp-kit/core";

import { tools } from "./crawl4ai.tools.js";

serveFromEnv({
  name: "mcp-recipe-crawl4ai",
  version: "0.1.0",
  instructions:
    "Wraps the Crawl4AI HTTP API: fetch pages as markdown, fetch within a persistent browser session, and extract " +
    "query-relevant blocks. Set CRAWL4AI_BASE_URL (and CRAWL4AI_API_TOKEN if the server requires it) in the environment.",
  tools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
