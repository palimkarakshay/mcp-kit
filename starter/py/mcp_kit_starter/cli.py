"""Entry point. Reads config from the environment, builds the starter server,
and runs it over the selected transport.

    MCP_TRANSPORT=stdio  python -m mcp_kit_starter
    MCP_TRANSPORT=http MCP_HTTP_PORT=3000 MCP_AUTH_TOKEN=secret python -m mcp_kit_starter

Python twin of ``../ts/src/cli.py``.
"""

from __future__ import annotations

import sys

import anyio
from mcp.server.fastmcp import FastMCP

from .config import AppConfig, ConfigError, HttpConfig, load_config
from .server import create_starter_server
from .transports import run


def _create(config: AppConfig | None = None) -> FastMCP:
    # FastMCP needs the HTTP bind/security settings at construction time; pass
    # them through for the HTTP transport, none for stdio.
    if isinstance(config, HttpConfig):
        return create_starter_server(config)
    return create_starter_server()


async def _main_async() -> None:
    try:
        config = load_config()
    except ConfigError as err:
        print(f"[mcp] configuration error:\n{err}", file=sys.stderr, flush=True)
        raise SystemExit(2)

    await run(_create, config)


def main() -> None:
    """Console entry point (``mcp-kit-starter`` / ``python -m mcp_kit_starter``)."""
    try:
        anyio.run(_main_async)
    except SystemExit:
        raise
    except KeyboardInterrupt:  # pragma: no cover -- graceful Ctrl-C
        raise SystemExit(0)
    except BaseException as err:  # noqa: BLE001
        print(f"[mcp] fatal: {err}", file=sys.stderr, flush=True)
        raise SystemExit(1)


if __name__ == "__main__":  # pragma: no cover
    main()
