# Recipe: wrap a REST API

Turn a REST API into MCP tools. This recipe ships **two** servers that share one
hardened REST client (`src/rest-client.ts` — timeouts, retries with backoff,
JSON parsing, and HTTP→`McpToolError` mapping), to show the pattern across the
auth spectrum:

| Server | Upstream | Auth | Runs without setup? |
| --- | --- | --- | --- |
| **GitHub** (`src/github/`) | public GitHub REST API | none, or optional `GITHUB_TOKEN` (raises rate limits) | ✅ yes |
| **Anaplan** (`src/anaplan/`) | Anaplan Integration API v2 | `ANAPLAN_*` env → short-lived `AnaplanAuthToken` | needs a real tenant |

The lesson in both: **credentials come from the environment (the transport),
never from a tool argument.** The model passes only data — an owner/repo, an
action id.

## GitHub server (public endpoint)

```bash
pnpm --filter @mcp-kit/recipe-rest build
MCP_TRANSPORT=stdio node dist/github/cli.js
# optional: GITHUB_TOKEN=ghp_… to raise the 60/hr anonymous limit to 5,000/hr
```

Tools:
- `get_repository({ owner, repo })` — repo metadata (stars, language, …).
- `list_repository_issues({ owner, repo, state?, per_page?, page?, exclude_pull_requests? })` — one page of issues.

## Anaplan server (enterprise, async tasks)

Reimplemented in TypeScript from the Python client in the `anaplan-kit`
reference repo's `tooling/`. Faithful to the original: basic-auth login yields a
short-lived `AnaplanAuthToken` (refreshed before expiry), and running an
action **starts an async task and polls until `COMPLETE`**.

```bash
ANAPLAN_EMAIL=you@example.com ANAPLAN_PASSWORD=… \
ANAPLAN_WORKSPACE_ID=… ANAPLAN_MODEL_ID=… \
MCP_TRANSPORT=stdio node dist/anaplan/cli.js
```

Tools:
- `list_anaplan_actions({ kind? })` — discover ids (imports/exports/processes/actions).
- `run_anaplan_import({ import_id })` · `run_anaplan_export({ export_id })` · `run_anaplan_process({ process_id })` — run by id and wait for the task to finish.

> The Anaplan server needs a live tenant to do real work. The test suite drives
> it with an **injected fetch** (no tenant, no network), exercising the full
> auth → start-task → poll lifecycle — mirroring how the reference repo tests
> offline.

## Tests

```bash
pnpm --filter @mcp-kit/recipe-rest test       # mocked HTTP, hermetic
RUN_LIVE=1 pnpm --filter @mcp-kit/recipe-rest test   # also hits the real GitHub API
```

## Adapting it

Copy a server folder, point `RestClient` at your base URL, add static headers,
and pass `bearerToken` from an env var. Write one tool per capability with a
verb-first name and a description that says when to use it and what it does
*not* do — then `pnpm lint:tools`.
