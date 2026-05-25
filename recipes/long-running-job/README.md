# Recipe: long-running job (async + polling)

`@mcp-kit/recipe-jobs`

## The pattern it teaches

Some work takes longer than a single tool call should block for. Instead of
**run-and-wait** (where the tool blocks until the upstream operation finishes —
see the `wrap-rest-api` recipe), this server uses **async + polling**:

1. `start_job` kicks off the work and returns a `job_id` *immediately*.
2. The model polls `get_job_status` with that id until `status` is
   `"succeeded"` (the `result` is then populated) or `"cancelled"`.
3. `cancel_job` stops a job that is still queued or running.

The job store is a plain in-memory `Map` with no background workers: status
(`queued` → `running` → `succeeded`) and `progress` (0..1) are *computed* from
elapsed wall-clock time. The clock is injectable, and `duration_ms: 0`
completes a job instantly — both make the behaviour deterministic in tests.

## Tools

| Tool | Inputs | Returns |
| --- | --- | --- |
| `start_job` | `label`, `duration_ms?` (0–600000, default 3000) | `{ job_id, status }` |
| `get_job_status` | `job_id` | `{ job_id, status, progress, label, result? }` (`not_found` if unknown) |
| `cancel_job` | `job_id` | `{ job_id, status, progress, label }` (`not_found` if unknown) |
| `list_jobs` | `status?` filter | `{ count, jobs[] }` |

## Run it

```bash
pnpm --filter @mcp-kit/recipe-jobs build

# stdio (default)
MCP_TRANSPORT=stdio node dist/cli.js

# Streamable HTTP
MCP_TRANSPORT=http node dist/cli.js

# during development
pnpm --filter @mcp-kit/recipe-jobs dev
```

No environment variables are required; jobs live in the server process only.

## MCP client config (stdio)

```json
{ "mcpServers": { "jobs": { "command": "mcp-recipe-jobs" } } }
```
