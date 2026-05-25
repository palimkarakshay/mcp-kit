"""wrap-yfinance — a Python MCP recipe wrapping Yahoo Finance via yfinance.

Exposes get_ticker / get_news / get_chart as one MCP server, with an in-memory
cache and rate-limit handling, built on the ``mcp-kit-starter`` base. Runnable
via ``python -m yfinance_recipe.cli`` (needs the ``yfinance`` extra for live
data).
"""

from __future__ import annotations

from .client import YFinanceClient
from .server import build_server
from .tools import set_yfinance_client, tools

__all__ = ["YFinanceClient", "build_server", "tools", "set_yfinance_client"]
