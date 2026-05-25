# Tool-description rubric

The model's only documentation for a tool is its **name, description, and
schema**. Most "the model picked the wrong tool" bugs are *description* bugs,
not model bugs — so we lint descriptions the way we lint code.

This rubric is distilled from the CCA-F *Tool Design & MCP Integration* notes
(`03-tool-design-mcp/notes.md`) and Anthropic's *Writing effective tools for AI
agents*. The lint (`@mcp-kit/lint`) turns it into a score and a CI gate.

## Hard fail (a tool cannot pass while this is true)

- **No credentials in tool inputs.** A parameter named like a secret
  (`password`, `api_key`, `access_token`, `client_secret`, `private_key`,
  `authorization`, …) is structurally wrong: the schema is documentation *for
  the model*, and the model must never handle credentials. Auth lives at the
  transport (bearer token on Streamable HTTP; the parent process on stdio).

## Scored checks (weighted; 100 total, +10 for `wrap-*` tools; default pass threshold 80)

| Check | Weight | What it looks for |
| --- | ---: | --- |
| `name_format` | 10 | `snake_case`, lowercase, starts with a letter. |
| `verb_first` | 15 | First word is an imperative verb (`get`, `list`, `search`, `run`, `create`, …). Names what the tool *does*. |
| `when_to_use` | 20 | An explicit "Use this when …" sentence describing the ideal-use scenario. |
| `non_goals` | 15 | Says what it does **not** handle ("does not …", "use X instead"). Differentiation prevents mis-selection. |
| `params_described` | 20 | Every input field has a clear `.describe(...)` (≥ 12 chars). Unambiguous parameters. |
| `examples` | 15 | At least one worked example (in `examples`, or shown in the description). |
| `description_shape` | 5 | Substantive prose (multiple sentences, not a one-liner, not a wall of text). |
| `category_signal` | 10 | **Only for tools under a `wrap-*` recipe.** The description names the `wrap-<name>` category (e.g. `wrap-qdrant`), so a model can tell a *domain wrapper* from a *primitive*. |

### `category_signal`: domain wrapper vs. primitive

This check applies **only** to tools discovered under a `wrap-*` recipe
directory — those are domain wrappers (they wrap one named upstream: Qdrant,
Crawl4AI, yfinance, …). Their description should include the `wrap-<name>`
category, derived from the recipe folder, so that when a model is choosing among
many tools it can tell "this is the Qdrant wrapper" from a generic primitive
like `get_current_time`.

Tools that are **not** under a `wrap-*` path are primitives: the check is
skipped for them and their maximum stays 100. For a domain wrapper the maximum
is 110, so a wrapper that names its category still scores 100/100; one that omits
it loses 10 points (a soft nudge, not a hard fail).

## Why these, in one line each

1. **Differentiation > naming > nudging.** A great description distinguishes
   this tool from its neighbours; that is what stops wrong-tool selection.
2. **Name what it operates on + input shape + ideal use + non-goals.** Those
   four are the load-bearing parts of a description.
3. **Examples are documentation.** A concrete call removes ambiguity a prose
   description leaves behind.
4. **Auth is a transport concern.** Credentials in a schema is the canonical
   anti-pattern; the lint refuses it outright.

## Using the lint

```bash
pnpm lint:tools                 # scan the whole workspace, fail CI below threshold
pnpm --filter @mcp-kit/lint run lint -- --root . --threshold 90 --json
```

The lint discovers every `*.tools.ts` registry in the repo, scores each tool,
prints a per-tool breakdown, and exits non-zero if any tool hard-fails or
scores below the threshold.
