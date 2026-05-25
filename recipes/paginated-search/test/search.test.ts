import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { describe, expect, it } from "vitest";

import { PRODUCTS } from "../src/dataset.js";
import { tools } from "../src/search.tools.js";

interface Page {
  items: { id: string; name: string; category: string }[];
  next_cursor: string | null;
  has_more: boolean;
  total_matched: number;
}

async function withServer<T>(
  fn: (client: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>,
): Promise<T> {
  const { client, close } = await connectInMemory(buildServer({ name: "search-test", version: "0", tools }));
  try {
    return await fn(client);
  } finally {
    await close();
  }
}

describe("paginated-search server", () => {
  it("first page returns `limit` items, a next_cursor, and has_more=true", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "search_records", arguments: { limit: 20 } });
      const sc = res.structuredContent as Page;
      expect(sc.items.length).toBe(20);
      expect(sc.has_more).toBe(true);
      expect(typeof sc.next_cursor).toBe("string");
      expect(sc.total_matched).toBe(PRODUCTS.length);
    });
  });

  it("passing next_cursor returns the next, disjoint page", async () => {
    await withServer(async (client) => {
      const first = await client.callTool({ name: "search_records", arguments: { limit: 20 } });
      const firstSc = first.structuredContent as Page;
      const firstIds = new Set(firstSc.items.map((i) => i.id));

      const second = await client.callTool({
        name: "search_records",
        arguments: { limit: 20, cursor: firstSc.next_cursor },
      });
      const secondSc = second.structuredContent as Page;
      expect(secondSc.items.length).toBe(20);
      // No overlap between page 1 and page 2.
      for (const item of secondSc.items) expect(firstIds.has(item.id)).toBe(false);
    });
  });

  it("the final page has next_cursor=null and has_more=false", async () => {
    await withServer(async (client) => {
      // 50 records, page size 20 -> pages of 20, 20, 10.
      const p1 = (await client.callTool({ name: "search_records", arguments: { limit: 20 } }))
        .structuredContent as Page;
      const p2 = (
        await client.callTool({ name: "search_records", arguments: { limit: 20, cursor: p1.next_cursor } })
      ).structuredContent as Page;
      const p3 = (
        await client.callTool({ name: "search_records", arguments: { limit: 20, cursor: p2.next_cursor } })
      ).structuredContent as Page;

      expect(p3.items.length).toBe(10);
      expect(p3.has_more).toBe(false);
      expect(p3.next_cursor).toBeNull();
    });
  });

  it("a malformed cursor is an invalid_input error", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "search_records",
        arguments: { cursor: "not-a-real-cursor!!" },
      });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("invalid_input");
    });
  });

  it("query and category filtering works", async () => {
    await withServer(async (client) => {
      const byQuery = (
        await client.callTool({ name: "search_records", arguments: { query: "laptop", limit: 100 } })
      ).structuredContent as Page;
      expect(byQuery.items.length).toBeGreaterThan(0);
      for (const item of byQuery.items) {
        expect(`${item.name} ${item.category}`.toLowerCase()).toContain("laptop");
      }

      const byCategory = (
        await client.callTool({ name: "search_records", arguments: { category: "camera", limit: 100 } })
      ).structuredContent as Page;
      expect(byCategory.items.length).toBeGreaterThan(0);
      for (const item of byCategory.items) expect(item.category).toBe("camera");
      expect(byCategory.has_more).toBe(false);
    });
  });

  it("get_record returns one record and errors on an unknown id", async () => {
    await withServer(async (client) => {
      const ok = await client.callTool({ name: "get_record", arguments: { id: "p009" } });
      expect((ok.structuredContent as { id: string }).id).toBe("p009");

      const missing = await client.callTool({ name: "get_record", arguments: { id: "nope" } });
      expect(missing.isError).toBe(true);
      const sc = missing.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("not_found");
    });
  });
});
