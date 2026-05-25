import { buildServer } from "@mcp-kit/core";
import { connectInMemory } from "@mcp-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { SqlDatabase } from "../src/database.js";
import { setDatabase, tools } from "../src/sql.tools.js";

afterEach(() => setDatabase(undefined));

async function withServer<T>(fn: (c: Awaited<ReturnType<typeof connectInMemory>>["client"]) => Promise<T>): Promise<T> {
  setDatabase(SqlDatabase.demo());
  const conn = await connectInMemory(buildServer({ name: "sql-test", version: "0", tools }));
  try {
    return await fn(conn.client);
  } finally {
    await conn.close();
  }
}

describe("SQL server", () => {
  it("lists the demo tables", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "list_tables", arguments: {} });
      const sc = res.structuredContent as { tables: string[] };
      expect(sc.tables).toEqual(["customers", "orders"]);
    });
  });

  it("describes a table's columns", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({ name: "describe_table", arguments: { table_name: "customers" } });
      const sc = res.structuredContent as { columns: { name: string; primaryKey: boolean }[] };
      expect(sc.columns.map((c) => c.name)).toEqual(["id", "name", "city"]);
      expect(sc.columns.find((c) => c.name === "id")?.primaryKey).toBe(true);
    });
  });

  it("runs a parameterised SELECT", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "run_select_query",
        arguments: { sql: "SELECT name FROM customers WHERE city = ?", params: ["London"] },
      });
      const sc = res.structuredContent as { rowCount: number; rows: { name: string }[] };
      expect(sc.rowCount).toBe(1);
      expect(sc.rows[0]?.name).toBe("Ada Lovelace");
    });
  });

  it("caps results and flags truncation", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "run_select_query",
        arguments: { sql: "SELECT * FROM orders", max_rows: 2 },
      });
      const sc = res.structuredContent as { rowCount: number; truncated: boolean };
      expect(sc.rowCount).toBe(2);
      expect(sc.truncated).toBe(true);
    });
  });

  it("rejects a non-read-only statement with a structured error", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "run_select_query",
        arguments: { sql: "DELETE FROM customers" },
      });
      expect(res.isError).toBe(true);
      const sc = res.structuredContent as unknown as { error: { code: string } };
      expect(sc.error.code).toBe("invalid_input");
    });
  });

  it("rejects multiple statements", async () => {
    await withServer(async (client) => {
      const res = await client.callTool({
        name: "run_select_query",
        arguments: { sql: "SELECT 1; DROP TABLE customers" },
      });
      expect(res.isError).toBe(true);
    });
  });
});
