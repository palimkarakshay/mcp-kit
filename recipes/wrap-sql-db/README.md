# Recipe: wrap a SQL database

Expose a SQL database through MCP tools **with guardrails** — the point is not
"give the model a SQL console", it's safe, read-only, parameterised access.
Built on Node's bundled `node:sqlite`, so it runs with zero setup.

## Run it

```bash
pnpm --filter @mcp-kit/recipe-sql build

# Seeded in-memory demo (customers + orders) — no setup:
MCP_TRANSPORT=stdio node dist/cli.js

# A real SQLite file, opened READ-ONLY:
SQLITE_PATH=/data/app.db MCP_TRANSPORT=stdio node dist/cli.js
```

## Tools

- `list_tables({})` — table names.
- `describe_table({ table_name })` — columns, types, nullability, primary keys.
- `run_select_query({ sql, params?, max_rows? })` — run one read-only statement.

## The safety layer (`src/database.ts`)

- **Read-only.** A file DB is opened `readOnly`; every query is *also* checked
  at the statement level — single statement, must start with `SELECT`/`WITH`.
  In SQLite a `WITH … SELECT` cannot mutate, so this is airtight.
- **Parameterised.** Values go in `params` and bind to `?` placeholders. There
  is no string-concatenation path, so no SQL injection. The tool description
  teaches the model to do this.
- **Capped.** Results are bounded by `max_rows` (a missing `LIMIT` is added), and
  the response flags `truncated` so a careless `SELECT *` can't flood context.

```jsonc
// run_select_query — note the value is in params, not the SQL string
{ "sql": "SELECT name, city FROM customers WHERE city = ?", "params": ["London"] }
```

## Adapting it

Swap `node:sqlite` for your driver (`pg`, `mysql2`, …) inside `SqlDatabase`,
keep `assertReadOnly` + parameter binding + the row cap, and connect with a
least-privilege, read-only database role as defence in depth.
