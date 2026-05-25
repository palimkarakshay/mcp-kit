# Auth patterns

> **Auth lives at the transport, not in tool inputs.** The input schema is
> documentation *for the model*, and the model should never see or handle a
> credential. Putting a token in a tool's schema is structurally wrong — and the
> lint rejects it as a hard fail.

## stdio: the parent process owns identity

There is no port and no token. The client spawned the server as a child
process, so whatever identity/secrets the server needs come from the
**environment it was launched with** (`env` in the client's server config). The
starter applies **no** auth middleware on stdio.

```jsonc
// client config — secrets go in env, never passed as tool args
{
  "command": "node",
  "args": ["dist/cli.js"],
  "env": { "GITHUB_TOKEN": "ghp_…" }
}
```

## Streamable HTTP: bearer token in middleware

The auth hook (`starter/src/auth.ts`) is Express middleware that runs
**before** the MCP layer. With `MCP_AUTH_TOKEN` set, every request must carry
`Authorization: Bearer <token>` (compared in constant time) or gets a `401`
with a JSON error envelope. On success it attaches an `AuthInfo` to `req.auth`,
which the SDK forwards to tool handlers as `extra.authInfo`.

```bash
MCP_TRANSPORT=http MCP_AUTH_TOKEN=s3cret MCP_REQUIRE_AUTH=true node dist/cli.js
```

For real deployments, swap the shared-secret check for a verifier:

```ts
import { bearerAuth } from "@mcp-kit/core";
app.use("/mcp", bearerAuth({
  required: true,
  verify: async (token) => {
    const claims = await verifyJwt(token);          // your IdP / introspection
    return claims ? { token, clientId: claims.sub, scopes: claims.scopes } : null;
  },
}));
```

The Python twin (`python-twin`) applies the equivalent as Starlette ASGI
middleware with the same envelope and constant-time comparison.

## Where the *upstream* API's credentials go

Tools that wrap an authenticated API read the upstream credential from the
**environment**, and build the client at startup — never from a tool argument.
The REST recipe shows the full spectrum:

| Upstream | Credential | Source | In tool inputs? |
| --- | --- | --- | --- |
| **GitHub** (public) | optional `GITHUB_TOKEN` (raises rate limits) | env | no |
| **Anaplan** (enterprise) | `ANAPLAN_EMAIL` + `ANAPLAN_PASSWORD` → short-lived `AnaplanAuthToken`, refreshed before expiry | env | no |

The model passes only *data* — an owner/repo, an action id — and the server
attaches credentials at the transport/client boundary. That separation is the
whole point: the model orchestrates; the transport authenticates.

## HTTP threat model

The Streamable HTTP transport is the one with a network surface. The starter's
defaults address the common attacks; here's the model it's built against.

| Threat | Mitigation in the kit |
| --- | --- |
| **Unauthenticated access** | Bearer token required when `MCP_AUTH_TOKEN` is set (constant-time compared); `MCP_REQUIRE_AUTH=true` refuses to start without one. Swap in a `verify` fn for JWT/OAuth. |
| **DNS rebinding** (a malicious web page driving a localhost server) | `Host`/`Origin` allow-lists with DNS-rebinding protection on by default (`MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS`). |
| **Network exposure** | Binds to `127.0.0.1` by default. Exposing `0.0.0.0` is opt-in and should sit behind TLS + auth. |
| **Session hijacking** | The `Mcp-Session-Id` is a high-entropy `randomUUID` and must be treated as a bearer secret — only sent over the authenticated channel, never logged. A session is bound to the server instance that created it. |
| **Untrusted tool arguments** | Every tool input is validated against its Zod schema at the boundary by the SDK before the handler runs; handlers never see unvalidated args. Credentials are categorically barred from inputs (lint hard-fail). |
| **Oversized / malformed bodies** | JSON body limit (`4mb`); non-`initialize` requests without a known session id are rejected with a structured `400`. |
| **Information leakage on error** | Failures return a structured envelope (`code`/`message`/`retryable`) — never a stack trace. |

What is **out of scope** for the starter (add for production as needed):
per-client rate limiting, audit logging, mTLS, and a full OAuth resource-server
flow (the SDK provides primitives for the last one).

## Checklist

- [ ] No tool input is named like a secret (the lint enforces this).
- [ ] HTTP servers set `MCP_AUTH_TOKEN` (or a `verify` fn); bind to `127.0.0.1`
      unless fronted by TLS + auth.
- [ ] Upstream credentials come from env, read once at startup.
- [ ] stdio servers receive secrets via the client's `env`, not arguments.
