"""Transport selection: dispatch to stdio or Streamable HTTP from config.

Python twin of ``../starter/src/transports/index.py``.
"""

from __future__ import annotations

from collections.abc import Callable

from mcp.server.fastmcp import FastMCP

from ..config import AppConfig, HttpConfig
from .http import build_http_app, run_http
from .stdio import run_stdio

__all__ = ["run", "run_stdio", "run_http", "build_http_app"]


async def run(create_server: Callable[..., FastMCP], config: AppConfig) -> None:
    """Run a server over the transport named in ``config``."""
    if isinstance(config, HttpConfig):
        await run_http(create_server(config), config)
    else:
        await run_stdio(create_server())
