import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import type { HttpConfig } from "../src/config.js";
import { createStarterServer } from "../src/server.js";
import { runHttp, type HttpServerHandle } from "../src/transports/http.js";

function httpConfig(overrides: Partial<HttpConfig> = {}): HttpConfig {
  return {
    transport: "http",
    host: "127.0.0.1",
    port: 0, // OS-assigned free port
    path: "/mcp",
    stateless: false,
    auth: { required: false },
    allowedHosts: [],
    allowedOrigins: [],
    dnsRebindingProtection: false, // exercised via loadConfig unit tests instead
    ...overrides,
  };
}

let handle: HttpServerHandle | undefined;

afterEach(async () => {
  await handle?.close();
  handle = undefined;
});

async function connect(url: string, headers?: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "http-test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: headers ? { headers } : undefined,
  });
  await client.connect(transport);
  return client;
}

describe("Streamable HTTP transport", () => {
  it("serves tools over a real HTTP session (stateful)", async () => {
    handle = await runHttp(createStarterServer, httpConfig());
    const client = await connect(handle.url);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("get_current_time");

      const res = await client.callTool({
        name: "get_current_time",
        arguments: { timezone: "UTC" },
      });
      const sc = res.structuredContent as { timezone: string };
      expect(sc.timezone).toBe("UTC");
    } finally {
      await client.close();
    }
  });

  it("works in stateless mode too", async () => {
    handle = await runHttp(createStarterServer, httpConfig({ stateless: true }));
    const client = await connect(handle.url);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("get_current_time");
    } finally {
      await client.close();
    }
  });

  it("rejects requests without a valid bearer token when auth is configured", async () => {
    handle = await runHttp(
      createStarterServer,
      httpConfig({ auth: { token: "letmein", required: true } }),
    );
    await expect(connect(handle.url)).rejects.toThrow();
  });

  it("accepts requests carrying the correct bearer token", async () => {
    handle = await runHttp(
      createStarterServer,
      httpConfig({ auth: { token: "letmein", required: true } }),
    );
    const client = await connect(handle.url, { Authorization: "Bearer letmein" });
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });
});
