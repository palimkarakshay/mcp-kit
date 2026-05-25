import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

// End-to-end over a real spawned process speaking stdio JSON-RPC. Exercises the
// built `dist/cli.js`, so it depends on `pnpm build` having run.
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

describe("stdio transport (spawned process, end-to-end)", () => {
  it("initializes and serves a tool call over stdio", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliPath],
      env: { ...process.env, MCP_TRANSPORT: "stdio" },
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain("get_current_time");

      const res = await client.callTool({
        name: "get_current_time",
        arguments: { timezone: "UTC", format: "iso" },
      });
      const sc = res.structuredContent as { timezone: string; localTime: string };
      expect(sc.timezone).toBe("UTC");
      expect(sc.localTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    } finally {
      await client.close();
    }
  });
});
