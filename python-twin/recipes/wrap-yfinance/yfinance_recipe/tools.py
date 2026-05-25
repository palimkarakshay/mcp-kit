"""yfinance tools — a single MCP server over Yahoo Finance.

Three tools: get_ticker, get_news, get_chart. The client (with its TTL cache and
rate-limit handling) is built lazily; tests inject one via
:func:`set_yfinance_client`.

Prior art: narumiruna/yfinance-mcp (https://github.com/narumiruna/yfinance-mcp),
an existing yfinance MCP server. This recipe is the cookbook's worked version of
that pattern, built on the mcp-kit base.
"""

from __future__ import annotations

from typing import Any

from mcp.types import ToolAnnotations

from mcp_kit_starter import ToolExample, ToolSpec, define_tool

from .client import YFinanceClient

_injected: YFinanceClient | None = None


def set_yfinance_client(client: YFinanceClient | None) -> None:
    """Override the client (tests)."""
    global _injected
    _injected = client


def _yf() -> YFinanceClient:
    global _injected
    if _injected is None:
        _injected = YFinanceClient()
    return _injected


def _get_ticker_handler(symbol: str) -> dict[str, Any]:
    return _yf().get_ticker(symbol)


def _get_news_handler(symbol: str, limit: int = 10) -> dict[str, Any]:
    return _yf().get_news(symbol, limit)


def _get_chart_handler(symbol: str, period: str = "1mo", interval: str = "1d") -> dict[str, Any]:
    return _yf().get_chart(symbol, period, interval)


_get_ticker = define_tool(
    ToolSpec(
        name="get_ticker",
        title="Get a stock quote",
        description=(
            "Get the current quote and key facts for one stock/ETF ticker via Yahoo Finance. "
            "Use this when you have a symbol (e.g. AAPL, VTI) and want its latest price, currency, "
            "previous close, market cap, exchange, and name. Results are briefly cached, so repeated "
            "calls do not hammer Yahoo. "
            "It does not return news (use get_news) or price history (use get_chart), does not place "
            "trades, and is not a symbol search — you must already know the ticker. "
            "Part of the wrap-yfinance server (a yfinance wrapper), not a primitive. "
            'Example: get_ticker({ "symbol": "AAPL" }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": 'Ticker symbol, e.g. "AAPL" or "VTI".'}
            },
            "required": ["symbol"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "name": {"type": ["string", "null"]},
                "currency": {"type": ["string", "null"]},
                "price": {"type": ["number", "null"]},
                "previousClose": {"type": ["number", "null"]},
                "marketCap": {"type": ["number", "null"]},
                "exchange": {"type": ["string", "null"]},
            },
            "required": ["symbol"],
            "additionalProperties": True,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[ToolExample(description="Apple's current quote.", arguments={"symbol": "AAPL"})],
        handler=_get_ticker_handler,
        text_summary=lambda p: f'{p["symbol"]}: {p.get("price")} {p.get("currency") or ""}'.strip(),
    )
)


_get_news = define_tool(
    ToolSpec(
        name="get_news",
        title="Get recent news for a ticker",
        description=(
            "Get recent news headlines for one ticker from Yahoo Finance. "
            "Use this when you want the latest articles about a company/fund you already have the symbol "
            "for — each item has a title, publisher, link, and publish time. Results are briefly cached. "
            "It does not return the article body or do sentiment analysis, does not return the quote (use "
            "get_ticker) or price history (use get_chart). "
            "Part of the wrap-yfinance server (a yfinance wrapper), not a primitive. "
            'Example: get_news({ "symbol": "AAPL", "limit": 5 }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": 'Ticker symbol, e.g. "AAPL".'},
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "default": 10,
                    "description": "Maximum number of articles to return. Defaults to 10.",
                },
            },
            "required": ["symbol"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "count": {"type": "number"},
                "articles": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["symbol", "count", "articles"],
            "additionalProperties": False,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[ToolExample(description="Five latest Apple headlines.", arguments={"symbol": "AAPL", "limit": 5})],
        handler=_get_news_handler,
        text_summary=lambda p: f'{p["count"]} article(s) for {p["symbol"]}.',
    )
)


_get_chart = define_tool(
    ToolSpec(
        name="get_chart",
        title="Get price history (OHLCV)",
        description=(
            "Get historical OHLCV price bars for one ticker from Yahoo Finance. "
            "Use this when you want a price series to chart or analyse — pick a period (e.g. 1mo, 1y) and "
            "an interval (e.g. 1d, 1h); it returns each bar's date, open, high, low, close, and volume, "
            "plus the first and last bar. Results are briefly cached. "
            "It does not compute indicators (RSI, moving averages) or render an image, and does not return "
            "the quote (use get_ticker) or news (use get_news). "
            "Part of the wrap-yfinance server (a yfinance wrapper), not a primitive. "
            'Example: get_chart({ "symbol": "AAPL", "period": "1mo", "interval": "1d" }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": 'Ticker symbol, e.g. "AAPL".'},
                "period": {
                    "type": "string",
                    "enum": ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"],
                    "default": "1mo",
                    "description": 'How far back to fetch. Defaults to "1mo".',
                },
                "interval": {
                    "type": "string",
                    "enum": ["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"],
                    "default": "1d",
                    "description": 'Bar size. Intraday intervals only work for short periods. Defaults to "1d".',
                },
            },
            "required": ["symbol"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "symbol": {"type": "string"},
                "period": {"type": "string"},
                "interval": {"type": "string"},
                "count": {"type": "number"},
                "bars": {"type": "array", "items": {"type": "object"}},
                "first": {"type": "object"},
                "last": {"type": "object"},
            },
            "required": ["symbol", "period", "interval", "count", "bars"],
            "additionalProperties": False,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[
            ToolExample(description="One month of daily bars.", arguments={"symbol": "AAPL", "period": "1mo", "interval": "1d"})
        ],
        handler=_get_chart_handler,
        text_summary=lambda p: f'{p["count"]} {p["interval"]} bar(s) for {p["symbol"]} over {p["period"]}.',
    )
)


tools: list[ToolSpec] = [_get_ticker, _get_news, _get_chart]

__all__ = ["tools", "set_yfinance_client"]
