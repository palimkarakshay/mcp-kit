/** Build the starter MCP server: server identity + its tool registry. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { tools as starterTools } from "./starter.tools.js";
import { registerTools } from "./tool.js";

export const SERVER_INFO = { name: "mcp-kit-starter", version: "0.1.0" } as const;

/**
 * The tools this starter ships (re-exported from `starter.tools.ts`). Recipes
 * export their own array of the same shape; the tool-description lint discovers
 * and grades all of them.
 */
export { starterTools };

/**
 * Construct a fresh server. The HTTP transport calls this once per session, so
 * it must build a new instance every time and hold no shared mutable state.
 */
export function createStarterServer(): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Starter MCP server from mcp-kit. One example tool (get_current_time); replace it with your own.",
  });
  registerTools(server, starterTools);
  return server;
}
