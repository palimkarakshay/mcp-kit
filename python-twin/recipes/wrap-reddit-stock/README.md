# wrap-reddit-stock (Python recipe)

A single MCP server that wraps Reddit (via [PRAW](https://praw.readthedocs.io))
and **detects the stock tickers** mentioned in posts. It's the sibling adapter
for the *dumbest-investor* / *thesis-tracker* `sources/` directories: one server
turns subreddit chatter into structured posts + tickers.

Python-only, built on the `mcp-kit-starter` base. The symbol-detection pattern
follows [maoramsallem/reddit-mcp-server](https://github.com/maoramsallem/reddit-mcp-server).

| Tool | Returns |
| --- | --- |
| `get_subreddit_posts` | Recent posts from a subreddit, each with detected tickers. |
| `search_posts` | Posts matching a query (in a subreddit or all of Reddit), with tickers. |
| `get_trending_symbols` | Tickers ranked by mentions across a subreddit's recent posts. |

### Symbol detection
`reddit_recipe/symbols.py` is a pure, dependency-free function you can reuse:
cashtags (`$TSLA`) always count; bare all-caps tokens (`TSLA`) count only when
2–5 letters and not in a stoplist of common words (`THE`, `CEO`, `YOLO`, …). It's
a heuristic — treat the output as a signal.

## Run it

Reddit needs API credentials (create a "script" app at reddit.com/prefs/apps).
`praw` is an **optional extra**:

```bash
cd python-twin
.venv/bin/pip install -e ".[dev,reddit]"

REDDIT_CLIENT_ID=… REDDIT_CLIENT_SECRET=… REDDIT_USER_AGENT="mcp-kit/0.1 by u/you" \
  MCP_TRANSPORT=stdio .venv/bin/python -m reddit_recipe.cli
```

(Run with `recipes/wrap-reddit-stock/` on `PYTHONPATH`, or from this directory.)
Credentials are read from the **environment** — never tool arguments. For prices
and news on the tickers you find here, pair it with the
[`wrap-yfinance`](../wrap-yfinance) recipe.

## Tests

From `python-twin/` (testpaths includes `recipes`):

```bash
cd python-twin && .venv/bin/python -m pytest
```

Hermetic: tests inject a **fake source**, so they exercise the tools, symbol
detection, ranking, and rate-limit mapping without `praw`, credentials, or the
network.
