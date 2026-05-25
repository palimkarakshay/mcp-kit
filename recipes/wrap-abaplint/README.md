# Recipe: wrap abaplint (the ABAP linter)

Turn [abaplint](https://abaplint.org) into MCP tools. Unlike the HTTP recipes,
there is **no REST client**: abaplint runs **in process** via `@abaplint/core`,
so the recipe builds a `Registry`, parses, and collects issues directly.

| Tool | What it does |
| --- | --- |
| `lint_string` | Lint ABAP passed as a string (give a filename for object-type detection). |
| `lint_file` | Lint one `.abap` file on the server's filesystem, by path. |
| `lint_directory` | Recursively lint every `*.abap` under a directory (capped). |
| `get_rule_explanations` | Explain abaplint rules — full metadata for given keys, or the whole catalog. |

> The "lint" verb was added to the tool-description lint's verb list so these
> names pass as verb-first — see [`lint/rubric.md`](../../lint/rubric.md).

## This is the sibling for clean-core-academy

The academy's `src/lib/abap/lintAbap.ts` can become a **thin client of this MCP
server** instead of embedding abaplint itself: it calls `lint_string` (or
`lint_file`) and renders the structured issues.

There is an [`abaplint/abaplint-mcp-server`](https://github.com/abaplint/abaplint-mcp-server)
project upstream — prefer it if it fits. If you'd rather not take that
dependency, **this recipe *is* that server**, built on the mcp-kit base and
ready to extract: copy the folder out and publish it.

## Run it

```bash
pnpm --filter @mcp-kit/recipe-abaplint build
MCP_TRANSPORT=stdio node dist/cli.js
```

No credentials and no network: abaplint lints locally. `lint_file` /
`lint_directory` read ABAP from the filesystem the server runs on (point the
server at your checked-out repo).

## Tests

```bash
pnpm --filter @mcp-kit/recipe-abaplint test
```

Hermetic and offline: tests lint strings and **temp files**, exercise the rule
catalog, and check the `not_found` path — no fixtures committed, no network.

## Adapting it

Swap the default config (`Config.getDefault()` in `src/linter.ts`) for a project
`abaplint.json` if you want your repo's exact rule set, and add a tool to surface
the default fixes abaplint already computes for many rules.
