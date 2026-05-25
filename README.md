# mcp-kit

**A production-grade MCP server starter + cookbook — one hardened base, four recipes, and a tool-description lint.**

Most MCP servers are toys glued to a transport. `mcp-kit` is the opposite: a
small, hardened base you actually ship, plus worked recipes for the integrations
you'll really build, plus a lint that keeps your tool descriptions good enough
for a model to use.

- **One base** — `starter/` — a hardened server with transport selection
  (stdio **and** Streamable HTTP), an auth hook, structured errors, and a typed
  tool helper. TypeScript, with a **Python twin**.
- **Recipes** — `recipes/` — `wrap-a-REST-API`, `wrap-a-SQL-DB`,
  `long-running-job`, `paginated-search`. Each is one focused server that
  imports the base.
- **A tool-description lint** — `lint/` — scores every tool's name + description
  + schema against a rubric and fails CI below threshold.
- **Docs** — `docs/` — transport selection, schema do/don't, auth patterns.

## Layout

```
starter/
  ts/        @mcp-kit/core — the base (importable) + runnable example server
  py/        the Python twin (FastMCP)
recipes/
  wrap-rest-api/      GitHub (public) + Anaplan (enterprise) REST → MCP tools
  wrap-sql-db/        read-only, parameterised SQL over node:sqlite
  long-running-job/   start → poll → cancel (async, returns a job id)
  paginated-search/   opaque cursor pagination over a dataset
lint/        @mcp-kit/lint — the tool-description lint + rubric
docs/        transport-selection · schema-dos-and-donts · auth-patterns
```

## Quickstart (TypeScript)

```bash
pnpm install
pnpm build            # builds @mcp-kit/core first, then the recipes that import it

# Run the starter over stdio (logs to stderr; stdout is the JSON-RPC channel)
MCP_TRANSPORT=stdio  node starter/ts/dist/cli.js

# …or over Streamable HTTP with auth
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_AUTH_TOKEN=s3cret node starter/ts/dist/cli.js
```

Point an MCP client at it (stdio example):

```jsonc
{
  "mcpServers": {
    "mcp-kit-starter": { "command": "node", "args": ["starter/ts/dist/cli.js"] }
  }
}
```

## Quickstart (Python twin)

```bash
cd starter/py
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
MCP_TRANSPORT=stdio  python -m mcp_kit_starter
MCP_TRANSPORT=http MCP_AUTH_TOKEN=s3cret python -m mcp_kit_starter
```

## The recipes

| Recipe | Pattern it teaches | Runs out of the box? |
| --- | --- | --- |
| [`wrap-rest-api`](recipes/wrap-rest-api) | Wrap a REST API: shared client, retries, error mapping, auth-at-transport. Two servers: **GitHub** (public API) and **Anaplan** (credential exchange + async tasks). | GitHub: yes (no auth needed). Anaplan: needs a tenant. |
| [`wrap-sql-db`](recipes/wrap-sql-db) | Wrap a SQL DB **safely**: read-only, parameterised, capped. | Yes (seeded in-memory demo DB). |
| [`long-running-job`](recipes/long-running-job) | Async + polling: start returns an id, poll for the result. | Yes (in-memory). |
| [`paginated-search`](recipes/paginated-search) | Opaque cursor pagination done right. | Yes (in-memory). |

The GitHub server wraps a **public endpoint** you can call for real:

```bash
pnpm --filter @mcp-kit/recipe-rest build
MCP_TRANSPORT=stdio node recipes/wrap-rest-api/dist/github/cli.js
# tool: get_repository({ "owner": "modelcontextprotocol", "repo": "servers" })
```

## The tool-description lint

```bash
pnpm lint:tools         # scores every tool in the repo; non-zero exit fails CI
```

It discovers every `*.tools.ts` registry, grades each tool (verb-first name,
when-to-use sentence, stated non-goals, described params, examples) and
**hard-fails any tool that puts a credential in its inputs**. Rubric:
[`lint/rubric.md`](lint/rubric.md).

## Develop

```bash
pnpm build        # build all packages (topological)
pnpm typecheck    # tsc --noEmit, every package
pnpm test         # vitest, every package
pnpm lint:tools   # the tool-description lint
pnpm check        # all of the above, in order (the CI gate)
```

## v0.1 status

- ✅ Starter runs over **stdio and HTTP** (proven by end-to-end tests: a spawned
  stdio process and a real HTTP client/server, plus a Python twin).
- ✅ The REST recipe **wraps a public endpoint** (GitHub) — wrapping verified
  through the MCP server with mocked HTTP, and an opt-in live test (`RUN_LIVE=1`).
- ✅ The **description lint passes** — all tools score 100/100.

## Credits

The `wrap-rest-api` Anaplan server is reimplemented from the Python client in
the `anaplan-kit` reference repo's `tooling/`. The lint rubric is distilled from
the `cca-f-prep` reference repo's `03-tool-design-mcp` notes and Anthropic's
*Writing effective tools for AI agents*.

MIT licensed.
