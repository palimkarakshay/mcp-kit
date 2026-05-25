/**
 * SQL tools — wrap a database safely.
 *
 * The database is opened lazily from `SQLITE_PATH` (read-only) or, if unset, a
 * seeded in-memory demo so the server runs with zero setup. Tests inject one
 * via {@link setDatabase}.
 */
import { type AnyToolSpec, defineTool, toolResult } from "@mcp-kit/core";
import { z } from "zod";

import { SqlDatabase, type SqlValue } from "./database.js";

let injected: SqlDatabase | undefined;

/** Override the database (tests). */
export function setDatabase(db: SqlDatabase | undefined): void {
  injected = db;
}

function database(): SqlDatabase {
  if (!injected) injected = SqlDatabase.open(process.env.SQLITE_PATH);
  return injected;
}

const listTables = defineTool({
  name: "list_tables",
  title: "List database tables",
  description:
    "List the tables in the connected SQL database. " +
    "Use this first when you do not yet know the schema — it returns the table names you can then inspect with " +
    "describe_table or read with run_select_query. " +
    "It does not return columns, row counts, or any data; it only lists table names. " +
    "Example: list_tables({}).",
  inputSchema: {},
  outputSchema: {
    tables: z.array(z.string()).describe("Names of the tables in the database."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [{ description: "See what tables exist.", arguments: {} }],
  handler: () => {
    const tables = database().listTables().map((t) => t.name);
    return toolResult(`Tables: ${tables.join(", ") || "(none)"}`, { tables });
  },
});

const describeTable = defineTool({
  name: "describe_table",
  title: "Describe a table",
  description:
    "Describe the columns of one table in the connected SQL database. " +
    "Use this when you know a table's name (from list_tables) and need its column names, types, nullability and " +
    "primary-key flags before writing a query. " +
    "It does not return the table's rows and does not run a query — use run_select_query for data. " +
    'Example: describe_table({ "table_name": "orders" }).',
  inputSchema: {
    table_name: z
      .string()
      .min(1)
      .describe('Exact name of a table to inspect, e.g. "orders" (get names from list_tables).'),
  },
  outputSchema: {
    table: z.string().describe("The table that was described."),
    columns: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          notNull: z.boolean(),
          primaryKey: z.boolean(),
        }),
      )
      .describe("One entry per column."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [{ description: "Inspect the orders table.", arguments: { table_name: "orders" } }],
  handler: (args) => {
    const columns = database().describeTable(args.table_name);
    return toolResult(`${args.table_name}: ${columns.map((c) => `${c.name} ${c.type}`).join(", ")}`, {
      table: args.table_name,
      columns,
    });
  },
});

const runSelectQuery = defineTool({
  name: "run_select_query",
  title: "Run a read-only query",
  description:
    "Run a single read-only SQL query against the connected database and return the rows. " +
    "Use this to read data once you know the schema (see list_tables / describe_table): pass one SELECT (or " +
    "WITH … SELECT) statement, and supply any user-provided values separately in params as ? placeholders — never " +
    "interpolate values into the SQL string (that is how injection happens). " +
    "It rejects anything that is not a single read-only statement: it does not insert, update, delete, alter, run " +
    "multiple statements, or return more than max_rows rows. " +
    'Example: run_select_query({ "sql": "SELECT name, city FROM customers WHERE city = ?", "params": ["London"] }).',
  inputSchema: {
    sql: z
      .string()
      .min(1)
      .describe("A single read-only SELECT/WITH statement. Use ? placeholders for values; do not concatenate."),
    params: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe("Values bound to the ? placeholders, in order. Defaults to an empty list.")
      .default([]),
    max_rows: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .describe("Maximum rows to return; extra rows are dropped and flagged. Defaults to 100.")
      .default(100),
  },
  outputSchema: {
    columns: z.array(z.string()).describe("Column names, in order."),
    rowCount: z.number().describe("Number of rows returned (after the cap)."),
    truncated: z.boolean().describe("True if more rows existed than max_rows."),
    rows: z.array(z.record(z.unknown())).describe("The result rows as objects keyed by column."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  examples: [
    {
      description: "Parameterised filter — note the value is in params, not the SQL.",
      arguments: { sql: "SELECT name, city FROM customers WHERE city = ?", params: ["London"] },
    },
    { description: "A join with a small cap.", arguments: { sql: "SELECT c.name, o.amount FROM orders o JOIN customers c ON c.id = o.customer_id", max_rows: 10 } },
  ],
  handler: (args) => {
    const result = database().runSelect(args.sql, args.params as SqlValue[], args.max_rows);
    const note = result.truncated ? ` (truncated to ${result.rowCount})` : "";
    return toolResult(`${result.rowCount} row(s)${note}.`, result);
  },
});

export const tools: AnyToolSpec[] = [listTables, describeTable, runSelectQuery];
