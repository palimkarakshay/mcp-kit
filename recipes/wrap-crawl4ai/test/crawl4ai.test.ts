import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { Crawl4aiClient } from "../src/client.js";
import { setCrawl4aiClient, tools } from "../src/crawl4ai.tools.js";
import type { FetchLike } from "../src/rest-client.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

interface CrawlBody {
  urls: string[];
  crawler_config: { params: Record<string, unknown> };
}

/** A fake Crawl4AI: shapes its reply from the crawler_config in the request. */
const fakeFetch: FetchLike = async (url, init) => {
  if (!url.includes("/crawl")) return json({ message: "not found" }, 404);
  const body = JSON.parse(String(init?.body ?? "{}")) as CrawlBody;
  const target = body.urls[0] ?? "";
  const params = body.crawler_config.params;

  if (target.includes("boom")) {
    return json({ results: [{ url: target, success: false, error_message: "navigation timeout", status_code: 0 }] });
  }
  if (params.extraction_strategy) {
    return json({
      results: [
        {
          url: target,
          success: true,
          extracted_content: JSON.stringify([
            { index: 0, tags: ["pricing"], content: "Enterprise plan is custom-priced." },
          ]),
        },
      ],
    });
  }
  return json({
    results: [
      {
        url: target,
        success: true,
        session_id: params.session_id ?? null,
        markdown: { raw_markdown: "# Raw\nfull page", fit_markdown: "# Fit\nmain content" },
      },
    ],
  });
};

afterEach(() => setCrawl4aiClient(undefined));

async function withServer<T>(fn: (client: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>): Promise<T> {
  setCrawl4aiClient(new Crawl4aiClient({ fetchImpl: fakeFetch }));
  const { client, close } = await connectInMemory(buildServer({ name: "crawl4ai-test", version: "0", tools }));
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

describe("Crawl4AI server", () => {
  it("fetch_markdown returns the fitted markdown by default", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "fetch_markdown", arguments: { url: "https://example.com" } });
      const sc = res.structuredContent as { markdown: string; filter: string; length: number };
      expect(sc.filter).toBe("fit");
      expect(sc.markdown).toContain("main content");
      expect(sc.length).toBe(sc.markdown.length);
    });
  });

  it("fetch_markdown can return raw markdown", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "fetch_markdown",
        arguments: { url: "https://example.com", filter: "raw" },
      });
      const sc = res.structuredContent as { markdown: string };
      expect(sc.markdown).toContain("full page");
    });
  });

  it("fetch_with_session echoes the session id back", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "fetch_with_session",
        arguments: { url: "https://example.com/feed", session_id: "s1", wait_for: "css:.item" },
      });
      const sc = res.structuredContent as { sessionId: string; markdown: string };
      expect(sc.sessionId).toBe("s1");
      expect(sc.markdown).toContain("main content");
    });
  });

  it("extract_cosine returns the clustered blocks", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "extract_cosine",
        arguments: { url: "https://example.com/pricing", query: "enterprise pricing" },
      });
      const sc = res.structuredContent as { count: number; blocks: { content: string }[] };
      expect(sc.count).toBe(1);
      expect(sc.blocks[0]?.content).toContain("Enterprise");
    });
  });

  it("surfaces a failed crawl as a structured upstream_error", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "fetch_markdown", arguments: { url: "https://boom.example" } });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("upstream_error");
    });
  });
});
