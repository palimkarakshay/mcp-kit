# Recipe: paginated search (cursor pagination)

`@mcp-kit/recipe-search`

## The pattern it teaches

How to expose a large result set to a model **one page at a time** with an
**opaque cursor**. `search_records` returns a single page plus a `next_cursor`;
the model pages forward by passing that value straight back as `cursor` until
`next_cursor` is `null`.

The cursor is a base64url-encoded offset, encoded and decoded entirely inside
the server. Callers never do cursor arithmetic — their only contract is "pass
`next_cursor` back as `cursor`" — and a cursor that does not decode is rejected
as `invalid_input`. Matching is a plain case-insensitive substring over
`name`/`category` over a fixed catalog: no fuzzy matching, no relevance ranking,
a stable order.

## Tools

| Tool | Inputs | Returns |
| --- | --- | --- |
| `search_records` | `query?`, `category?`, `limit` (1–100, default 20), `cursor?` | `{ items, next_cursor, has_more, total_matched }` (`invalid_input` on a bad cursor) |
| `get_record` | `id` | the single product (`not_found` if unknown) |

Paging example: call `search_records({ limit: 20 })`, then
`search_records({ limit: 20, cursor: <next_cursor> })`, repeating until
`next_cursor` is `null`.

## Run it

```bash
pnpm --filter @mcp-kit/recipe-search build

# stdio (default)
MCP_TRANSPORT=stdio node dist/cli.js

# Streamable HTTP
MCP_TRANSPORT=http node dist/cli.js

# during development
pnpm --filter @mcp-kit/recipe-search dev
```

No environment variables are required; the catalog is bundled in memory.

## MCP client config (stdio)

```json
{ "mcpServers": { "search": { "command": "mcp-recipe-search" } } }
```
