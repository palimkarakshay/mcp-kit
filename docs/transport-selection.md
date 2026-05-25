# Transport selection

> MCP has a **closed list of two** transports: `stdio` and **Streamable HTTP**
> (legacy name: HTTP+SSE). WebSockets, gRPC, and named pipes are **not** MCP
> transports. If a design proposes one of those, that is the bug.

The starter runs over both, chosen at runtime by the `MCP_TRANSPORT` env var —
the same build, no code change.

```bash
MCP_TRANSPORT=stdio  node dist/cli.js
MCP_TRANSPORT=http   MCP_HTTP_PORT=3000 node dist/cli.js
```

## Pick stdio when…

- The server runs **locally** for a **single user** (a desktop client, an IDE,
  a CLI).
- The client can **spawn the server as a child process** and owns its
  lifecycle.

Properties: no port, no network surface, **no auth to configure** — the parent
process that launched the server *is* the identity boundary. The one rule:
**stdout is the JSON-RPC channel**, so all logging goes to **stderr**
(`starter/ts/src/transports/stdio.ts` only ever writes to stderr).

## Pick Streamable HTTP when…

- The server is **remote** or serves **multiple users**.
- You need auth, horizontal scaling, or a server reachable over the network.

Properties: an HTTP endpoint (default `/mcp`), a bearer-token auth hook, and
DNS-rebinding protection. Two sub-modes (`starter/ts/src/transports/http.ts`):

| Mode | `MCP_STATELESS` | Behaviour | Use when |
| --- | --- | --- | --- |
| **stateful** (default) | unset / `false` | First `initialize` mints a session id (`Mcp-Session-Id`); the client may open a GET stream for server→client messages. One server instance per session. | You want streaming / server-initiated notifications, sticky sessions. |
| **stateless** | `true` | A fresh server + transport per request; no session, no streaming. | Serverless / behind a load balancer where any node can answer. |

### Security knobs (HTTP)

| Env | Meaning | Default |
| --- | --- | --- |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` / `MCP_HTTP_PATH` | Bind address and endpoint path | `127.0.0.1` / `3000` / `/mcp` |
| `MCP_AUTH_TOKEN` | Shared bearer token required on every request | unset (dev: no auth, with a warning) |
| `MCP_REQUIRE_AUTH` | Refuse to start without a token | `false` |
| `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` | DNS-rebinding allow-lists | host:port defaults |
| `MCP_DNS_REBINDING_PROTECTION` | Toggle Host/Origin checks | on when an allow-list exists |

> Bind to `127.0.0.1` for local HTTP. Only expose `0.0.0.0` behind something
> that terminates TLS and enforces auth, and always set `MCP_AUTH_TOKEN`.

## Server organisation (applies to both transports)

Prefer **server-per-capability**, not server-per-team: small, focused servers a
client composes (the recipes here are each one focused server), not a single
monolith that recreates the integration spaghetti MCP exists to remove.

## The Python twin

`starter/py` mirrors all of the above on the official Python SDK (`FastMCP`):
`MCP_TRANSPORT=http` maps to the SDK's `streamable-http`, with the same env
vars and the same bearer-token middleware.
