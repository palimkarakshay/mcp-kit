"""End-to-end stdio test over a real spawned process speaking JSON-RPC.

Spawns ``python -m mcp_kit_starter`` with ``MCP_TRANSPORT=stdio`` and drives it
with the SDK's stdio client -- proving the installed entry point speaks MCP.
"""

from __future__ import annotations

import os
import re
import sys

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


@pytest.mark.anyio
async def test_initializes_and_serves_a_tool_call_over_stdio() -> None:
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_kit_starter"],
        env={**os.environ, "MCP_TRANSPORT": "stdio"},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = (await session.list_tools()).tools
            assert "get_current_time" in [t.name for t in tools]

            res = await session.call_tool(
                "get_current_time", {"timezone": "UTC", "format": "iso"}
            )
            sc = res.structuredContent
            assert sc["timezone"] == "UTC"
            assert re.match(
                r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", sc["localTime"]
            )
