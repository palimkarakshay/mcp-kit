"""Streamable HTTP transport (legacy name: HTTP+SSE).

For remote / multi-user servers. The first ``initialize`` mints a session id;
the client echoes it back in ``Mcp-Session-Id`` on later requests. Stateless
mode (``MCP_STATELESS``) creates a fresh server per request instead.

Auth and DNS-rebinding protection live here, at the transport -- not in any
tool's inputs. The shared-bearer-token check is applied as a Starlette
middleware wrapping FastMCP's Streamable HTTP app.

Python twin of ``../ts/src/transports/http.py``.
"""

from __future__ import annotations

import sys
from collections.abc import Callable

from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from ..auth import BearerAuthMiddleware
from ..config import HttpConfig


def build_http_app(
    server: FastMCP,
    config: HttpConfig,
    *,
    warn: Callable[[str], None] | None = None,
) -> Starlette:
    """Build the Starlette app for the HTTP transport.

    Adds a ``/healthz`` route and wraps the MCP endpoint with bearer-token auth.
    Returned without binding a port, so tests can mount it on an ASGI test
    client directly.
    """
    app = server.streamable_http_app()

    async def healthz(_request: Request) -> JSONResponse:
        return JSONResponse(
            {
                "status": "ok",
                "transport": "http",
                "mode": "stateless" if config.stateless else "stateful",
            }
        )

    app.add_route("/healthz", healthz, methods=["GET"])

    # Auth hook: enforced for every request reaching the MCP endpoint. Mounted
    # as outermost middleware so unauthenticated requests never touch the MCP
    # session manager.
    app.add_middleware(
        BearerAuthMiddleware,
        token=config.auth.token,
        required=config.auth.required,
        warn=warn,
    )
    return app


async def run_http(server: FastMCP, config: HttpConfig) -> None:
    """Start the HTTP transport and serve until interrupted."""
    import uvicorn

    app = build_http_app(server, config)

    url = f"http://{config.host}:{config.port}{config.path}"
    auth_mode = "bearer" if config.auth.token else "none"
    mode = "stateless" if config.stateless else "stateful"
    print(
        f"[mcp] Streamable HTTP transport ready at {url} ({mode}, auth: {auth_mode})",
        file=sys.stderr,
        flush=True,
    )

    uv_config = uvicorn.Config(
        app,
        host=config.host,
        port=config.port,
        log_level="info",
    )
    await uvicorn.Server(uv_config).serve()
