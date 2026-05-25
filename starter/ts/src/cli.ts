#!/usr/bin/env node
/**
 * Entry point. Reads config from the environment, builds the starter server,
 * and runs it over the selected transport.
 *
 *   MCP_TRANSPORT=stdio  node dist/cli.js
 *   MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_AUTH_TOKEN=secret node dist/cli.js
 */
import { serveFromEnv } from "./serve.js";
import { SERVER_INFO, starterTools } from "./server.js";

serveFromEnv({
  name: SERVER_INFO.name,
  version: SERVER_INFO.version,
  instructions:
    "Starter MCP server from mcp-kit. One example tool (get_current_time); replace it with your own.",
  tools: starterTools,
}).catch((err: unknown) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
