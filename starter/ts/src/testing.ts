/**
 * Test helpers. Connect a server to an in-process client over a linked
 * in-memory transport — no sockets, no child process — so tool behaviour can
 * be asserted in milliseconds. Recipes import this for their own tests.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ConnectedClient {
  client: Client;
  close: () => Promise<void>;
}

/** Link `server` to a new {@link Client} over an in-memory transport pair. */
export async function connectInMemory(
  server: McpServer,
  clientName = "mcp-kit-test-client",
): Promise<ConnectedClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
