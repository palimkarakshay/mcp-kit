"""Build the Reddit-stock recipe server: identity + tool registry.

Mirrors ``mcp_kit_starter.server.create_starter_server`` but registers this
recipe's tools. Reused by ``cli.py`` and the tests.
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from mcp_kit_starter import HttpConfig, register_tools

from .tools import tools

SERVER_NAME = "mcp-recipe-reddit-stock"

_INSTRUCTIONS = (
    "Wraps Reddit (via PRAW) for stock discussion: get_subreddit_posts, search_posts, and "
    "get_trending_symbols, each with stock tickers detected in post text. Set REDDIT_CLIENT_ID, "
    "REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT in the environment."
)


def build_server(http: HttpConfig | None = None) -> FastMCP:
    """Construct a fresh server with the Reddit-stock recipe tools registered."""
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
    register_tools(server, tools)
    return server
