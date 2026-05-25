"""A small yfinance wrapper that adds the things an app shouldn't reinvent:
an in-memory TTL **cache** and **rate-limit handling** mapped to the kit's
structured errors.

The actual `yfinance` import lives in :mod:`yfinance_recipe.source` and is only
loaded lazily, so this module (and the tools that import it for schema/lint
purposes) never needs `yfinance` installed. Tests inject a fake source.

This is the sibling pattern for apps like *dumbest-investor* / *thesis-tracker*:
one MCP server owns yfinance, so every consumer gets caching + rate-limit
handling for free instead of embedding yfinance directly.
"""

from __future__ import annotations

import time
from typing import Any, Callable, Protocol

from mcp_kit_starter import McpToolError

_RATE_LIMIT_HINTS = ("rate limit", "ratelimited", "too many requests", "429")


class TickerSource(Protocol):
    """The slice of yfinance this recipe uses, normalised to plain dicts."""

    def info(self, symbol: str) -> dict[str, Any]: ...
    def news(self, symbol: str) -> list[dict[str, Any]]: ...
    def history(self, symbol: str, period: str, interval: str) -> list[dict[str, Any]]: ...


class YFinanceClient:
    """yfinance with a TTL cache and rate-limit→structured-error mapping."""

    def __init__(
        self,
        *,
        source: TickerSource | None = None,
        cache_ttl: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._source = source
        self._cache_ttl = cache_ttl
        self._clock = clock
        self._cache: dict[tuple[Any, ...], tuple[float, Any]] = {}

    def _src(self) -> TickerSource:
        if self._source is None:
            from .source import YFinanceSource  # lazy: only here do we need yfinance

            self._source = YFinanceSource()
        return self._source

    def _cached(self, key: tuple[Any, ...], produce: Callable[[], Any]) -> Any:
        now = self._clock()
        hit = self._cache.get(key)
        if hit is not None and now - hit[0] < self._cache_ttl:
            return hit[1]
        value = self._guard(produce)
        self._cache[key] = (now, value)
        return value

    @staticmethod
    def _guard(fn: Callable[[], Any]) -> Any:
        try:
            return fn()
        except McpToolError:
            raise
        except Exception as exc:  # noqa: BLE001 -- normalise any source failure
            text = f"{type(exc).__name__} {exc}".lower()
            if any(hint in text for hint in _RATE_LIMIT_HINTS):
                raise McpToolError(
                    "rate_limited",
                    "yfinance is being rate-limited by Yahoo; back off and retry.",
                    retryable=True,
                ) from exc
            raise McpToolError("upstream_error", f"yfinance error: {exc}") from exc

    def get_ticker(self, symbol: str) -> dict[str, Any]:
        info = self._cached(("info", symbol), lambda: self._src().info(symbol))
        if not info or (info.get("price") is None and info.get("name") is None):
            raise McpToolError("not_found", f"No market data for ticker {symbol!r}.")
        return {
            "symbol": symbol.upper(),
            "name": info.get("name"),
            "currency": info.get("currency"),
            "price": info.get("price"),
            "previousClose": info.get("previousClose"),
            "marketCap": info.get("marketCap"),
            "exchange": info.get("exchange"),
        }

    def get_news(self, symbol: str, limit: int = 10) -> dict[str, Any]:
        articles = self._cached(("news", symbol), lambda: self._src().news(symbol))
        trimmed = list(articles)[:limit]
        return {"symbol": symbol.upper(), "count": len(trimmed), "articles": trimmed}

    def get_chart(self, symbol: str, period: str = "1mo", interval: str = "1d") -> dict[str, Any]:
        bars = self._cached(
            ("history", symbol, period, interval),
            lambda: self._src().history(symbol, period, interval),
        )
        if not bars:
            raise McpToolError(
                "not_found", f"No price history for {symbol!r} (period={period}, interval={interval})."
            )
        return {
            "symbol": symbol.upper(),
            "period": period,
            "interval": interval,
            "count": len(bars),
            "bars": bars,
            "first": bars[0],
            "last": bars[-1],
        }
