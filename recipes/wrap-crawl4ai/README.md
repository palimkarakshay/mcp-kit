# Recipe: wrap the Crawl4AI HTTP API

Turn a running [Crawl4AI](https://github.com/unclecode/crawl4ai) server into MCP
tools. This is the recipe to copy when **you already run a scraper service** (or
any HTTP API) and want to expose it over MCP without learning the SDK: point the
client at your base URL, write one tool per capability, ship.

It reuses the **error-mapping core of `wrap-rest-api`** — `src/rest-client.ts`
is lifted verbatim from that recipe (timeouts, retries with backoff, JSON
parsing, and HTTP→`McpToolError` mapping), so every tool fails the same legible,
structured way. Keeping a copy in-folder (rather than importing across recipes)
is deliberate: this whole directory is meant to be lifted out.

| Tool | What it does | Crawl4AI feature |
| --- | --- | --- |
| `fetch_markdown` | One URL → clean markdown (`fit` or `raw`). | `POST /crawl`, markdown generator |
| `fetch_with_session` | Fetch inside a persistent browser session (cookies/JS state survive). | `crawler_config.session_id`, `js_code`, `wait_for` |
| `extract_cosine` | Keep only the page blocks most similar to a query. | `CosineStrategy` extraction |

> **Naming:** the kit's tool-description lint requires verb-first names, so the
> "cosine extraction" capability is `extract_cosine`, not `cosine_extract`. That
> is the lint doing its job — see [`lint/rubric.md`](../../lint/rubric.md).

## Run it

You need a Crawl4AI server reachable over HTTP (its Docker image listens on
`:11235` by default):

```bash
docker run -d -p 11235:11235 unclecode/crawl4ai:latest

pnpm --filter @mcp-kit/recipe-crawl4ai build
MCP_TRANSPORT=stdio CRAWL4AI_BASE_URL=http://127.0.0.1:11235 node dist/cli.js
# optional, only if your server enforces JWT auth:
#   CRAWL4AI_API_TOKEN=… node dist/cli.js
```

`CRAWL4AI_BASE_URL` and `CRAWL4AI_API_TOKEN` are read from the **environment**
(a transport concern); the model only ever passes data — a URL, a query, a
session id. That is the auth-at-transport rule the whole kit is built on.

## Tests

```bash
pnpm --filter @mcp-kit/recipe-crawl4ai test
```

Hermetic: the Crawl4AI server is replaced by an **injected fetch** that shapes
its reply from the `crawler_config` in each request, so the full markdown /
session / cosine / error paths run with no Docker and no network.

## Adapting it to your own service

1. Copy this folder; rename the package.
2. Point `Crawl4aiClient` (rename it) at your base URL, set static headers, and
   pass `bearerToken` from an env var — never a tool argument.
3. Write one tool per capability with a **verb-first** name and a description
   that says when to use it, what it does *not* do, and which `wrap-*` server it
   belongs to (so a model can tell a domain wrapper from a primitive).
4. `pnpm lint:tools`.

> Field mapping in `client.ts` is intentionally tolerant (Crawl4AI's `markdown`
> is a string in some builds, an object with `fit_markdown`/`raw_markdown` in
> others). Match it to the version you run.
