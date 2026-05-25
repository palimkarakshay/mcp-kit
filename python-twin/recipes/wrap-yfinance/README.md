# wrap-yfinance (Python recipe)

A single MCP server that wraps [`yfinance`](https://github.com/ranaroussi/yfinance)
(Yahoo Finance) so a consuming app **stops embedding yfinance directly** and
gets an in-memory **cache** and **rate-limit handling** for free. This is the
sibling pattern for the *dumbest-investor* / *thesis-tracker* repos: one server
owns the data source; every consumer talks MCP.

Python-only (no TypeScript twin), built on the `mcp-kit-starter` base.

| Tool | Returns |
| --- | --- |
| `get_ticker` | Latest quote: price, currency, previous close, market cap, exchange, name. |
| `get_news` | Recent headlines: title, publisher, link, publish time. |
| `get_chart` | OHLCV history for a period/interval, plus first/last bar. |

**Prior art:** [narumiruna/yfinance-mcp](https://github.com/narumiruna/yfinance-mcp)
is an existing yfinance MCP server; this recipe is the cookbook's worked version
of that pattern on the mcp-kit base, with explicit caching + rate-limit→`rate_limited`
error mapping and an injectable data source for offline tests.

## Run it

`yfinance` is an **optional extra** (live data only); install it, then run:

```bash
cd python-twin
.venv/bin/pip install -e ".[dev,yfinance]"

MCP_TRANSPORT=stdio .venv/bin/python -m yfinance_recipe.cli
```

(Run with `recipes/wrap-yfinance/` on `PYTHONPATH`, or from this directory.) No
credentials are needed — Yahoo Finance is public. The cache TTL keeps repeated
calls from tripping Yahoo's rate limits; when a limit is hit anyway, the tool
returns a structured `rate_limited` error (retryable) instead of a raw stack.

## Tests

From `python-twin/` (testpaths includes `recipes`):

```bash
cd python-twin && .venv/bin/python -m pytest
```

Hermetic: tests inject a **fake source**, so they exercise the tools, caching,
and rate-limit mapping without importing `yfinance` or hitting the network.
