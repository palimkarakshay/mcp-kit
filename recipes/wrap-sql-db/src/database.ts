/**
 * A safety-first wrapper around a SQLite database (Node's built-in
 * `node:sqlite`). The point of this recipe is not "give the model a SQL
 * console" — it is to expose a database through tools with guardrails:
 *
 *  - **Read-only.** A file database is opened `readOnly`; every query is also
 *    checked at the statement level (single statement, must start with
 *    SELECT/WITH). In SQLite a WITH…SELECT cannot mutate, so this is airtight.
 *  - **Parameterised.** Callers pass values separately from SQL; we bind them
 *    to `?` placeholders, so there is no string-concatenation injection path.
 *  - **Capped.** Results are bounded so a careless `SELECT *` can't flood the
 *    context window.
 */
import { createRequire } from "node:module";
import type { DatabaseSync as Database } from "node:sqlite";

import { invalidInput } from "@mcp-kit/core";

// Load `node:sqlite` via createRequire: it is a newer builtin that some
// bundlers/test runners fail to resolve statically, so we reach for it at
// runtime through Node's native require. (`import type` above is erased.)
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire("node:sqlite") as typeof import("node:sqlite");

export type SqlValue = string | number | boolean | null;

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface TableInfo {
  name: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Reject anything that is not a single read-only statement. */
export function assertReadOnly(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (trimmed.length === 0) throw invalidInput("Query is empty.");
  if (trimmed.includes(";")) {
    throw invalidInput("Only a single statement is allowed; remove the ';'.");
  }
  if (!/^(select|with)\b/i.test(trimmed)) {
    throw invalidInput("Only read-only queries are allowed (must start with SELECT or WITH).");
  }
  return trimmed;
}

export class SqlDatabase {
  readonly isDemo: boolean;
  private readonly db: Database;

  constructor(db: Database, isDemo: boolean) {
    this.db = db;
    this.isDemo = isDemo;
  }

  /** Open a file database read-only, or build the seeded in-memory demo. */
  static open(path: string | undefined): SqlDatabase {
    if (path) {
      return new SqlDatabase(new DatabaseSync(path, { readOnly: true }), false);
    }
    return SqlDatabase.demo();
  }

  static demo(): SqlDatabase {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);
      CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO customers (id, name, city) VALUES
        (1, 'Ada Lovelace', 'London'),
        (2, 'Alan Turing', 'Manchester'),
        (3, 'Grace Hopper', 'New York');
      INSERT INTO orders (id, customer_id, amount, created_at) VALUES
        (1, 1, 120.50, '2024-01-05'),
        (2, 1, 80.00, '2024-02-11'),
        (3, 2, 220.00, '2024-02-15'),
        (4, 3, 15.75, '2024-03-02');
    `);
    return new SqlDatabase(db, true);
  }

  listTables(): TableInfo[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((r) => ({ name: r.name }));
  }

  describeTable(tableName: string): ColumnInfo[] {
    if (!IDENTIFIER_RE.test(tableName)) {
      throw invalidInput(`Invalid table name: "${tableName}".`);
    }
    const known = new Set(this.listTables().map((t) => t.name));
    if (!known.has(tableName)) {
      // notFound is more appropriate, but keep the dependency surface small.
      throw invalidInput(`Unknown table: "${tableName}". Use list_tables to see what exists.`);
    }
    // table_info() does not accept bound parameters; the name is whitelisted above.
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      notNull: r.notnull === 1,
      primaryKey: r.pk > 0,
    }));
  }

  runSelect(sql: string, params: SqlValue[], maxRows: number): QueryResult {
    const safe = assertReadOnly(sql);
    const bounded = /\blimit\b/i.test(safe) ? safe : `${safe} LIMIT ${maxRows + 1}`;
    const bind = params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
    const stmt = this.db.prepare(bounded);
    const allRows = stmt.all(...bind) as Record<string, unknown>[];
    const truncated = allRows.length > maxRows;
    const rows = truncated ? allRows.slice(0, maxRows) : allRows;
    const first = rows[0];
    const columns = first ? Object.keys(first) : [];
    return { columns, rows, rowCount: rows.length, truncated };
  }

  close(): void {
    this.db.close();
  }
}
