# Schema & description do / don't

A tool's **name, description, and schema are the only documentation the model
ever gets.** Most "the model picked the wrong tool" bugs are *description* bugs.
This kit treats descriptions as code: the lint (`@mcp-kit/lint`) scores every
tool and fails CI below threshold. See `lint/rubric.md` for the scored checks.

## Names

- ✅ **Verb-first, `snake_case`:** `get_repository`, `run_select_query`,
  `list_jobs`, `search_records`. The name says what the tool *does*.
- ❌ `repository`, `data`, `helper`, `doStuff`, `Repo-Lookup`. Nouns and vague
  names force the model to guess from the description alone.

## Descriptions — name four things

A good description names: **what it operates on**, the **input shape**, the
**ideal-use scenario**, and **what it does *not* handle**. That last one —
differentiation — is what stops mis-selection between similar tools.

- ✅ A **"Use this when …"** sentence (ideal-use scenario).
- ✅ A **"It does not …" / "use X instead"** sentence (non-goals). Differentiation
  beats naming beats system-prompt nudging.
- ✅ At least one **worked example** call. Examples remove ambiguity prose leaves.
- ❌ One-liners like *"Search the system for documents"* or *"Find files."* They
  read fine to a human and are useless to a model choosing between five tools.

Real example (`recipes/wrap-sql-db/src/sql.tools.ts`):

> Run a single read-only SQL query… **Use this to** read data once you know the
> schema… supply user values separately in `params` as `?` placeholders.
> **It rejects** anything that is not a single read-only statement: it **does
> not** insert, update, delete, alter, run multiple statements, or return more
> than `max_rows` rows. *Example:* `run_select_query({ "sql": "…WHERE city = ?",
> "params": ["London"] })`.

## Parameters

- ✅ **`.describe()` every field.** It's the only per-parameter doc the model
  sees. Say units, defaults, format, and what is *not* accepted (e.g. "IANA name,
  not a `+05:30` offset").
- ✅ **Constrain types:** `z.enum([...])`, `.int().min().max()`, sensible
  `.default()`s. A tight schema is a better spec than prose.
- ✅ **Add an `outputSchema`** so results come back as validated
  `structuredContent`, and return it via `toolResult(text, payload)`.
- ❌ **Never put credentials in inputs** — `password`, `api_key`, `access_token`,
  `client_secret`, … This is a **hard fail** in the lint. Auth is a transport
  concern (see `auth-patterns.md`); the schema is for the model, and the model
  must never handle secrets. (Pagination tokens like `cursor` / `page_token` are
  fine — they're not credentials.)

## Errors

- ✅ Throw a structured `McpToolError` (`invalidInput`, `notFound`,
  `upstreamError`, …). The framework converts it to a stable envelope:
  `{ error: { code, message, retryable, details? } }` with `isError: true`.
- ❌ Don't let raw exceptions / stack traces reach the model — they're unusable
  documentation and can leak internals.

## Primitive fit (tools vs resources vs prompts)

- **tool** — executable, side-effecting, **model-invoked**. (Everything here.)
- **resource** — read-only data referenced by URI, **app/user-invoked**.
- **prompt** — a reusable template, **user-invoked**.

Don't expose a static document as a *tool*, or a workflow as a *resource* —
primitive misfit is its own class of bug.
