# mcp-kit

**A production-grade MCP server starter + cookbook — one hardened base, four recipes, and a tool-description lint.**

Most MCP servers are toys glued to a transport. `mcp-kit` is the opposite: a
small, hardened base you actually ship, plus worked recipes for the integrations
you'll really build, plus a lint that keeps your tool descriptions good enough
for a model to use.

- **One base** — `starter/` — a hardened TypeScript server (`@mcp-kit/core`) with
  transport selection (stdio **and** Streamable HTTP), an auth hook, structured
  errors, and a typed tool helper.
- **A Python twin** — `python-twin/` — the smallest faithful mirror, so the
  cookbook is language-agnostic.
- **Recipes** — `recipes/` — `wrap-a-REST-API`, `wrap-a-SQL-DB`,
  `long-running-job`, `paginated-search`. Each is one focused server that
  imports the base.
- **A tool-description lint** — `lint/` — scores every tool's name + description
  + schema against a rubric and fails CI below threshold.
- **Docs** — `docs/` — transport selection, schema design, auth patterns.

## Layout

```
starter/              @mcp-kit/core — the base (importable) + runnable example server
  src/{server,transports/{stdio,http},auth,tools/}.ts
python-twin/          the Python twin (FastMCP) — same transports, auth, errors
recipes/
  wrap-rest-api/      GitHub (public) + Anaplan (enterprise) REST → MCP tools
  wrap-sql-db/        read-only, parameterised SQL over node:sqlite
  long-running-job/   start → poll → cancel (async, returns a job id)
  paginated-search/   opaque cursor pagination over a dataset
  wrap-crawl4ai/      Crawl4AI HTTP API → markdown / session / cosine tools
  wrap-qdrant/        Qdrant REST API → create / upsert / search (TS + Python twin)
lint/describe-lint.ts @mcp-kit/lint — the tool-description lint (+ rubric.md)
docs/                 transports · schema-design · auth-patterns
```

## Quickstart (TypeScript)

```bash
pnpm install
pnpm build            # builds @mcp-kit/core first, then the recipes that import it

# Run the starter over stdio (logs to stderr; stdout is the JSON-RPC channel)
MCP_TRANSPORT=stdio  node starter/dist/cli.js

# …or over Streamable HTTP with auth
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_AUTH_TOKEN=s3cret node starter/dist/cli.js
```

Point an MCP client at it (stdio example):

```jsonc
{
  "mcpServers": {
    "mcp-kit-starter": { "command": "node", "args": ["starter/dist/cli.js"] }
  }
}
```

## Quickstart (Python twin)

```bash
cd python-twin
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
| [`wrap-crawl4ai`](recipes/wrap-crawl4ai) | Wrap a scraper HTTP API: reuses the REST recipe's error-mapping client. Tools: `fetch_markdown`, `fetch_with_session`, `extract_cosine`. | Needs a running Crawl4AI server. |
| [`wrap-qdrant`](recipes/wrap-qdrant) | Wrap the Qdrant vector-DB REST API: `create_collection`, `upsert_points`, `search`. Ships a **Python twin**. (For curated *memory*, use Mem0 on top.) | Needs a running Qdrant. |
| [`wrap-yfinance`](python-twin/recipes/wrap-yfinance) | **Python-only.** Wrap a library (yfinance) as one MCP server with caching + rate-limit handling. Tools: `get_ticker`, `get_news`, `get_chart`. | Yes (`yfinance` extra for live data). |

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

Poke the running server with the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
# stdio
npx @modelcontextprotocol/inspector --cli node starter/dist/cli.js --method tools/list
npx @modelcontextprotocol/inspector --cli node starter/dist/cli.js \
  --method tools/call --tool-name get_current_time --tool-arg timezone=UTC

# Streamable HTTP (start the server first: MCP_TRANSPORT=http node starter/dist/cli.js)
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3000/mcp --method tools/list
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
