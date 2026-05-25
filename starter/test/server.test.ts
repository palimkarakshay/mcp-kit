import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.js";
import { errorResult, invalidInput } from "../src/errors.js";
import { createStarterServer } from "../src/server.js";
import { connectInMemory } from "../src/testing.js";

interface ErrorSC {
  error: { code: string; message: string; retryable: boolean; details?: unknown };
}

describe("starter server over an in-memory transport", () => {
  it("advertises the example tool with when-to-use docs", async () => {
    const { client, close } = await connectInMemory(createStarterServer());
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "get_current_time");
      expect(tool).toBeDefined();
      expect(tool?.description ?? "").toMatch(/use this when/i);
      expect(tool?.inputSchema).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("returns structured content on success", async () => {
    const { client, close } = await connectInMemory(createStarterServer());
    try {
      const res = await client.callTool({ name: "get_current_time", arguments: { timezone: "UTC" } });
      expect(res.isError).toBeFalsy();
      const sc = res.structuredContent as { timezone: string; utcIso: string; unixMs: number };
      expect(sc.timezone).toBe("UTC");
      expect(sc.utcIso).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(typeof sc.unixMs).toBe("number");
    } finally {
      await close();
    }
  });

  it("converts a bad time zone into a structured, non-retryable error", async () => {
    const { client, close } = await connectInMemory(createStarterServer());
    try {
      const res = await client.callTool({
        name: "get_current_time",
        arguments: { timezone: "Not/ARealZone" },
      });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as ErrorSC;
      expect(sc.error.code).toBe("invalid_input");
      expect(sc.error.retryable).toBe(false);
    } finally {
      await close();
    }
  });
});

describe("loadConfig", () => {
  it("defaults to the stdio transport", () => {
    expect(loadConfig({})).toEqual({ transport: "stdio" });
  });

  it("parses an HTTP config and turns auth + DNS protection on with a token", () => {
    const config = loadConfig({
      MCP_TRANSPORT: "http",
      MCP_HTTP_PORT: "8080",
      MCP_AUTH_TOKEN: "s3cret",
    });
    expect(config.transport).toBe("http");
    if (config.transport === "http") {
      expect(config.port).toBe(8080);
      expect(config.auth.token).toBe("s3cret");
      expect(config.auth.required).toBe(true);
      expect(config.dnsRebindingProtection).toBe(true);
      expect(config.allowedHosts).toContain("127.0.0.1:8080");
    }
  });

  it("rejects transports outside the closed list of two", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "websocket" })).toThrow(ConfigError);
  });

  it("rejects require-auth without a token", () => {
    expect(() => loadConfig({ MCP_TRANSPORT: "http", MCP_REQUIRE_AUTH: "true" })).toThrow(ConfigError);
  });
});

describe("structured errors", () => {
  it("maps an McpToolError to its envelope", () => {
    const res = errorResult(invalidInput("bad input", { field: "timezone" }));
    expect(res.isError).toBe(true);
    const sc = res.structuredContent as unknown as ErrorSC;
    expect(sc.error).toMatchObject({
      code: "invalid_input",
      retryable: false,
      details: { field: "timezone" },
    });
  });

  it("maps an unknown throwable to an internal error without leaking internals", () => {
    const res = errorResult("boom");
    const sc = res.structuredContent as unknown as ErrorSC;
    expect(sc.error.code).toBe("internal");
    expect(sc.error.retryable).toBe(false);
  });
});
