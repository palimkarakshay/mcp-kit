"""In-process client <-> server tests over the SDK's in-memory transport.

Mirrors the TS `connectInMemory` suite: the example tool is exercised end to end
through a real ClientSession, with no sockets or child process.
"""

from __future__ import annotations

import re

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from mcp_kit_starter.server import create_starter_server


@pytest.mark.anyio
async def test_advertises_tool_with_when_to_use_docs() -> None:
    async with create_connected_server_and_client_session(
        create_starter_server()
    ) as client:
        tools = (await client.list_tools()).tools
        tool = next((t for t in tools if t.name == "get_current_time"), None)
        assert tool is not None
        assert re.search(r"use this when", tool.description or "", re.IGNORECASE)
        assert "does not" in (tool.description or "").lower()
        assert tool.inputSchema
        assert tool.outputSchema is not None


@pytest.mark.anyio
async def test_returns_structured_content_on_success() -> None:
    async with create_connected_server_and_client_session(
        create_starter_server()
    ) as client:
        res = await client.call_tool("get_current_time", {"timezone": "UTC"})
        assert not res.isError
        sc = res.structuredContent
        assert sc["timezone"] == "UTC"
        assert re.match(r"^\d{4}-\d{2}-\d{2}T.*Z$", sc["utcIso"])
        assert isinstance(sc["unixMs"], (int, float))


@pytest.mark.anyio
async def test_iso_local_time_is_sortable() -> None:
    async with create_connected_server_and_client_session(
        create_starter_server()
    ) as client:
        res = await client.call_tool(
            "get_current_time", {"timezone": "UTC", "format": "iso"}
        )
        assert re.match(
            r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$",
            res.structuredContent["localTime"],
        )


@pytest.mark.anyio
async def test_bad_timezone_becomes_structured_non_retryable_error() -> None:
    async with create_connected_server_and_client_session(
        create_starter_server()
    ) as client:
        res = await client.call_tool(
            "get_current_time", {"timezone": "Not/ARealZone"}
        )
        assert res.isError is True
        error = res.structuredContent["error"]
        assert error["code"] == "invalid_input"
        assert error["retryable"] is False
