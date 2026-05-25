"""stdio transport.

The server is a child process of its client; the client owns the process
lifecycle and the parent's identity *is* the auth boundary -- there is no
network port and no token to check. The one rule: **stdout is the JSON-RPC
channel**, so every log line must go to stderr.

Python twin of ``../starter/src/transports/stdio.py``.
"""

from __future__ import annotations

import sys

from mcp.server.fastmcp import FastMCP


async def run_stdio(server: FastMCP) -> None:
    """Serve ``server`` over stdio until the stream closes."""
    # stderr only -- writing to stdout would corrupt the protocol stream.
    print("[mcp] stdio transport ready.", file=sys.stderr, flush=True)
    await server.run_stdio_async()
