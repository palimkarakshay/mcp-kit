/**
 * stdio transport.
 *
 * The server is a child process of its client; the client owns the process
 * lifecycle and the parent's identity *is* the auth boundary — there is no
 * network port and no token to check. The one rule: **stdout is the JSON-RPC
 * channel**, so every log line must go to stderr.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — writing to stdout would corrupt the protocol stream.
  console.error("[mcp] stdio transport ready.");
}
