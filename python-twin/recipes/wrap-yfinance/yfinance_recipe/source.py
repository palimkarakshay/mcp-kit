"""The real yfinance-backed source.

Imports of ``yfinance`` are local to each method so that the package is only a
hard dependency when you actually fetch live data — install it with the recipe's
``yfinance`` extra (``pip install -e ".[yfinance]"`` from ``python-twin``). The
tests never import this module; they inject a fake source instead.

Each method returns plain, normalised dicts so the rest of the recipe is free of
yfinance/pandas types.
"""

from __future__ import annotations

from typing import Any


class YFinanceSource:
    """Adapts ``yfinance.Ticker`` to the :class:`~.client.TickerSource` shape."""

    def info(self, symbol: str) -> dict[str, Any]:
        import yfinance as yf

        ticker = yf.Ticker(symbol)

        def _fast(attr: str) -> Any:
            try:
                return getattr(ticker.fast_info, attr)
            except Exception:  # noqa: BLE001
                return None

        name: str | None = None
        try:
            name = ticker.info.get("shortName") or ticker.info.get("longName")
        except Exception:  # noqa: BLE001 -- .info can be slow/raise; tolerate it
            name = None

        return {
            "name": name,
            "currency": _fast("currency"),
            "price": _fast("last_price"),
            "previousClose": _fast("previous_close"),
            "marketCap": _fast("market_cap"),
            "exchange": _fast("exchange"),
        }

    def news(self, symbol: str) -> list[dict[str, Any]]:
        import yfinance as yf

        out: list[dict[str, Any]] = []
        for item in (yf.Ticker(symbol).news or []):
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if isinstance(content, dict):  # newer yfinance schema
                provider = content.get("provider") or {}
                url = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
                out.append(
                    {
                        "title": content.get("title"),
                        "publisher": provider.get("displayName"),
                        "link": url.get("url") if isinstance(url, dict) else None,
                        "publishedAt": content.get("pubDate"),
                    }
                )
            else:  # older flat schema
                out.append(
                    {
                        "title": item.get("title"),
                        "publisher": item.get("publisher"),
                        "link": item.get("link"),
                        "publishedAt": item.get("providerPublishTime"),
                    }
                )
        return out

    def history(self, symbol: str, period: str, interval: str) -> list[dict[str, Any]]:
        import yfinance as yf

        frame = yf.Ticker(symbol).history(period=period, interval=interval)
        bars: list[dict[str, Any]] = []
        for index, row in frame.iterrows():
            stamp = getattr(index, "isoformat", lambda: str(index))()
            bars.append(
                {
                    "date": stamp,
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"]),
                }
            )
        return bars
