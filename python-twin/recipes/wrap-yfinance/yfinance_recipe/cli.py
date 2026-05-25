"""Entry point: load config from the environment, build, and run.

    MCP_TRANSPORT=stdio python -m yfinance_recipe.cli
    MCP_TRANSPORT=http MCP_AUTH_TOKEN=secret python -m yfinance_recipe.cli

Mirrors ``mcp_kit_starter.cli``. Requires the ``yfinance`` extra for live data
(``pip install -e ".[yfinance]"`` from python-twin).
"""

from __future__ import annotations

import sys

import anyio
from mcp.server.fastmcp import FastMCP

from mcp_kit_starter import AppConfig, ConfigError, HttpConfig, load_config
from mcp_kit_starter.transports import run

from .server import build_server


def _create(config: AppConfig | None = None) -> FastMCP:
    if isinstance(config, HttpConfig):
        return build_server(config)
    return build_server()


async def _main_async() -> None:
    try:
        config = load_config()
    except ConfigError as err:
        print(f"[mcp] configuration error:\n{err}", file=sys.stderr, flush=True)
        raise SystemExit(2)
    await run(_create, config)


def main() -> None:
    try:
        anyio.run(_main_async)
    except SystemExit:
        raise
    except KeyboardInterrupt:  # pragma: no cover
        raise SystemExit(0)
    except BaseException as err:  # noqa: BLE001
        print(f"[mcp] fatal: {err}", file=sys.stderr, flush=True)
        raise SystemExit(1)


if __name__ == "__main__":  # pragma: no cover
    main()
