import { McpToolError } from "@mcp-kit/core";
import { describe, expect, it, vi } from "vitest";

import { RestClient, type FetchLike } from "../src/rest-client.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function client(fetchImpl: FetchLike): RestClient {
  return new RestClient({ baseUrl: "https://api.example.com", fetchImpl, backoffMs: 0, maxRetries: 2 });
}

describe("RestClient", () => {
  it("returns parsed JSON on success and sends merged headers", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({ ok: true }));
    const result = await client(fetchImpl).request("GET", "/things", { query: { q: "a", n: 2 } });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.com/things?q=a&n=2");
    expect((init?.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("attaches a bearer token when configured", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({}));
    const c = new RestClient({ baseUrl: "https://api.example.com", bearerToken: "abc", fetchImpl });
    await c.request("GET", "/x");
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("maps 404 to a non-retryable not_found error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({ message: "Not Found" }, 404));
    await expect(client(fetchImpl).request("GET", "/missing")).rejects.toMatchObject({
      code: "not_found",
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn<FetchLike>(async () => {
      calls += 1;
      return calls === 1 ? json({ message: "slow down" }, 429) : json({ ok: true });
    });
    const result = await client(fetchImpl).request("GET", "/x");
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx up to the limit then throws a retryable upstream_unavailable", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json({ message: "boom" }, 503));
    const err = await client(fetchImpl).request("GET", "/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe("upstream_unavailable");
    expect((err as McpToolError).retryable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    const c = new RestClient({ baseUrl: "https://api.example.com", fetchImpl, timeoutMs: 5, backoffMs: 0, maxRetries: 0 });
    await expect(c.request("GET", "/slow")).rejects.toMatchObject({ code: "timeout" });
  });
});
