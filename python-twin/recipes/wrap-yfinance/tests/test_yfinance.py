"""Tests for the yfinance recipe, driven through an in-memory MCP client with a
fake source injected — no network, no ``yfinance`` install needed.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from yfinance_recipe.client import YFinanceClient
from yfinance_recipe.server import build_server
from yfinance_recipe.tools import set_yfinance_client


class FakeSource:
    def __init__(self) -> None:
        self.calls = {"info": 0, "news": 0, "history": 0}

    def info(self, symbol: str) -> dict[str, Any]:
        self.calls["info"] += 1
        return {
            "name": "Apple Inc.",
            "currency": "USD",
            "price": 190.0,
            "previousClose": 188.0,
            "marketCap": 3_000_000_000_000,
            "exchange": "NMS",
        }

    def news(self, symbol: str) -> list[dict[str, Any]]:
        self.calls["news"] += 1
        return [
            {"title": "Headline A", "publisher": "X", "link": "https://a", "publishedAt": 1},
            {"title": "Headline B", "publisher": "Y", "link": "https://b", "publishedAt": 2},
            {"title": "Headline C", "publisher": "Z", "link": "https://c", "publishedAt": 3},
        ]

    def history(self, symbol: str, period: str, interval: str) -> list[dict[str, Any]]:
        self.calls["history"] += 1
        return [
            {"date": "2024-01-01", "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 100},
            {"date": "2024-01-02", "open": 1.5, "high": 2.5, "low": 1.0, "close": 2.0, "volume": 200},
        ]


@pytest.fixture
def fake_source() -> Iterator[FakeSource]:
    src = FakeSource()
    set_yfinance_client(YFinanceClient(source=src, clock=lambda: 0.0))
    try:
        yield src
    finally:
        set_yfinance_client(None)


@pytest.mark.anyio
async def test_get_ticker_returns_quote(fake_source: FakeSource) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("get_ticker", {"symbol": "aapl"})
        assert not res.isError
        sc = res.structuredContent
        assert sc["symbol"] == "AAPL"
        assert sc["price"] == 190.0
        assert sc["currency"] == "USD"


@pytest.mark.anyio
async def test_get_news_respects_limit(fake_source: FakeSource) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("get_news", {"symbol": "AAPL", "limit": 2})
        assert not res.isError
        assert res.structuredContent["count"] == 2
        assert res.structuredContent["articles"][0]["title"] == "Headline A"


@pytest.mark.anyio
async def test_get_chart_returns_bars(fake_source: FakeSource) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("get_chart", {"symbol": "AAPL", "period": "1mo", "interval": "1d"})
        assert not res.isError
        sc = res.structuredContent
        assert sc["count"] == 2
        assert sc["first"]["date"] == "2024-01-01"
        assert sc["last"]["close"] == 2.0


@pytest.mark.anyio
async def test_results_are_cached(fake_source: FakeSource) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        await client.call_tool("get_ticker", {"symbol": "AAPL"})
        await client.call_tool("get_ticker", {"symbol": "AAPL"})
        # Second call is served from the TTL cache, so the source is hit once.
        assert fake_source.calls["info"] == 1


@pytest.mark.anyio
async def test_rate_limit_becomes_structured_error() -> None:
    class RateLimitedSource(FakeSource):
        def info(self, symbol: str) -> dict[str, Any]:
            raise RuntimeError("YFRateLimitError: Too Many Requests. Rate limited.")

    set_yfinance_client(YFinanceClient(source=RateLimitedSource()))
    try:
        async with create_connected_server_and_client_session(build_server()) as client:
            res = await client.call_tool("get_ticker", {"symbol": "AAPL"})
            assert res.isError is True
            error = res.structuredContent["error"]
            assert error["code"] == "rate_limited"
            assert error["retryable"] is True
    finally:
        set_yfinance_client(None)
