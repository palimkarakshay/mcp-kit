# mcp-kit-starter (Python)

A production-grade [Model Context Protocol](https://modelcontextprotocol.io)
server starter, built on the official Python SDK
([`mcp`](https://pypi.org/project/mcp/) / `FastMCP`).

This is the **Python twin of [`../starter`](../starter)** — the same hardened base, the
same behaviour, the same environment variables:

- **Two transports, one entry point**, selected by `MCP_TRANSPORT`: local
  **stdio** (default) or remote **Streamable HTTP**.
- **An auth hook at the transport** — a shared bearer token for HTTP, nothing
  for stdio (the parent process owns identity). Credentials never appear in tool
  inputs.
- **Structured errors** — every tool failure returns a stable envelope
  (`{"error": {"code", "message", "retryable", "details?"}}`) with `isError`
  set, never a raw stack trace.
- **One example tool**, `get_current_time`, that demonstrates the kit's habits:
  a verb-first name, a "use this when … / it does not …" description, described
  parameters, an output schema, read-only annotations, and structured failure.

## Requirements

- Python 3.11+

## Setup

Create a virtualenv and install the package (editable, with dev/test extras):

```bash
cd python-twin
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

`mcp` pulls in everything needed for both transports (Starlette, uvicorn, httpx).

## Running

### stdio (default)

stdio is for a server launched as a child process by an MCP client. **stdout is
the JSON-RPC channel**, so the server only ever logs to stderr.

```bash
.venv/bin/python -m mcp_kit_starter
# or, via the console script:
.venv/bin/mcp-kit-starter
```

### Streamable HTTP

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_AUTH_TOKEN=secret \
  .venv/bin/python -m mcp_kit_starter
```

The MCP endpoint is then mounted at `http://127.0.0.1:3000/mcp`. With a token
set, every request must send `Authorization: Bearer secret`; anything else gets
a `401` with a JSON error envelope. There is also a `GET /healthz` probe.

If `MCP_AUTH_TOKEN` is **unset**, HTTP still runs but logs a one-time warning to
stderr that it is unauthenticated.

## Environment variables

| Variable                       | Default       | Meaning                                                                  |
| ------------------------------ | ------------- | ------------------------------------------------------------------------ |
| `MCP_TRANSPORT`                | `stdio`       | `stdio` or `http`. Anything else is a fatal config error (exit code 2).  |
| `MCP_HTTP_HOST`                | `127.0.0.1`   | Bind host (HTTP only).                                                    |
| `MCP_HTTP_PORT`                | `3000`        | Bind port (HTTP only).                                                    |
| `MCP_HTTP_PATH`                | `/mcp`        | Path the MCP endpoint is mounted at. Must start with `/`.                |
| `MCP_AUTH_TOKEN`               | _(unset)_     | Shared bearer token. If set, HTTP requires it; if unset, HTTP warns.     |
| `MCP_REQUIRE_AUTH`             | `false`       | If truthy, refuse to serve HTTP without a token.                         |
| `MCP_STATELESS`                | `false`       | If truthy, HTTP runs stateless (a fresh server per request).             |
| `MCP_ALLOWED_HOSTS`            | bind address  | Comma-separated `Host` allow-list (DNS-rebinding protection).            |
| `MCP_ALLOWED_ORIGINS`          | _(empty)_     | Comma-separated `Origin` allow-list (DNS-rebinding protection).          |
| `MCP_DNS_REBINDING_PROTECTION` | auto          | Force DNS-rebinding protection on/off; defaults on when a list is set.   |

Truthy values are `1`, `true`, `yes`, `on` (case-insensitive).

## The example tool: `get_current_time`

Inputs:

- `timezone` — IANA name (e.g. `America/New_York`), default `"UTC"`. A numeric
  offset is not accepted; an unknown zone yields a structured `invalid_input`
  error (not a crash).
- `format` — `"iso"` (sortable `YYYY-MM-DD HH:MM:SS`) or `"human"` (a long
  readable form). Default `"iso"`.

Structured output: `timezone`, `localTime`, `utcIso`, `unixMs`.

## Tests

```bash
.venv/bin/python -m pytest
```

The suite is offline: it unit-tests the tool and config, exercises the tool
through the server over the SDK's in-memory client/server transport, and runs an
end-to-end stdio smoke test against a spawned `python -m mcp_kit_starter`.

## Layout

```
python-twin/
├── pyproject.toml            # package "mcp-kit-starter", dep on mcp>=1.27
├── requirements-dev.txt      # dev/test deps (pytest)
├── README.md
├── mcp_kit_starter/
│   ├── __init__.py           # public API re-exports
│   ├── __main__.py           # `python -m mcp_kit_starter`
│   ├── cli.py                # entry point: load config -> build -> run
│   ├── config.py             # env-driven AppConfig + ConfigError
│   ├── errors.py             # McpToolError, error envelope, error_result
│   ├── auth.py               # bearer-token ASGI middleware (HTTP only)
│   ├── server.py             # create_starter_server()
│   ├── tool.py               # ToolSpec / define_tool / register_tool
│   ├── tools/
│   │   ├── __init__.py       # the tool registry
│   │   └── get_current_time.py
│   └── transports/
│       ├── __init__.py       # run() dispatch
│       ├── stdio.py
│       └── http.py
└── tests/
```
