"""Build the starter MCP server: server identity + its tool registry.

Python twin of ``../ts/src/server.py``.
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from .config import HttpConfig
from .tool import register_tools
from .tools import tools as starter_tools

SERVER_NAME = "mcp-kit-starter"
SERVER_VERSION = "0.1.0"

_INSTRUCTIONS = (
    "Starter MCP server from mcp-kit. One example tool (get_current_time); "
    "replace it with your own."
)

__all__ = [
    "SERVER_NAME",
    "SERVER_VERSION",
    "starter_tools",
    "create_starter_server",
]


def create_starter_server(http: HttpConfig | None = None) -> FastMCP:
    """Construct a fresh server with the starter tools registered.

    When running over HTTP the bind host/port/path and stateless flag are passed
    through to FastMCP so its Streamable HTTP app is mounted correctly. Auth and
    DNS-rebinding protection are applied around that app in ``transports.http``.
    """
    kwargs: dict[str, object] = {"instructions": _INSTRUCTIONS}
    if http is not None:
        kwargs.update(
            host=http.host,
            port=http.port,
            streamable_http_path=http.path,
            stateless_http=http.stateless,
            transport_security=TransportSecuritySettings(
                enable_dns_rebinding_protection=http.dns_rebinding_protection,
                allowed_hosts=http.allowed_hosts,
                allowed_origins=http.allowed_origins,
            ),
        )

    server = FastMCP(SERVER_NAME, **kwargs)
    register_tools(server, starter_tools)
    return server
