"""Stock-symbol detection — the pattern borrowed from maoramsallem/reddit-mcp-server.

Reddit posts mention tickers two ways: a high-confidence **cashtag** (``$AAPL``)
and a noisy **bare all-caps** token (``AAPL``). Bare tokens collide with ordinary
words (``THE``, ``CEO``, ``YOLO``), so we keep cashtags always and filter bare
tokens through a stoplist + length rules.

This is deliberately a pure, dependency-free function so the adapters in
dumbest-investor / thesis-tracker can reuse it directly.
"""

from __future__ import annotations

import re
from collections import Counter

_CASHTAG = re.compile(r"\$([A-Za-z]{1,5})\b")
_BARE = re.compile(r"\b([A-Z]{2,5})\b")

# Common all-caps tokens that are not tickers. Extend for your subreddits.
STOPLIST: frozenset[str] = frozenset(
    {
        "THE", "AND", "FOR", "ARE", "YOU", "ALL", "NEW", "NOW", "BUY", "SELL", "HOLD",
        "CALL", "PUT", "CALLS", "PUTS", "DD", "YOLO", "WSB", "ATH", "EOD", "FYI", "IMO",
        "IMHO", "TLDR", "ETF", "CEO", "CFO", "CTO", "IPO", "USA", "USD", "EUR", "GDP",
        "FED", "SEC", "IRS", "EPS", "PE", "PT", "TA", "FD", "FDS", "OTM", "ITM", "LOL",
        "LMAO", "EDIT", "NYSE", "AI", "ML", "API", "OK", "NO", "YES", "WTF", "ELI", "EV",
        "RH", "TOS", "AH", "PM", "AM", "ER", "QE", "ROI", "ROE", "WSJ", "CNBC", "GME",
    }
)
# Note: GME/AMC etc. *are* tickers; keep them OUT of the stoplist in real use.
# A couple of well-known meme tickers are intentionally excluded below.
_ALWAYS_TICKERS = frozenset({"GME", "AMC", "BB", "NOK"})


def detect_symbols(text: str) -> dict[str, int]:
    """Return a mapping of detected ticker symbol -> mention count in ``text``.

    Cashtags (``$TSLA``) always count. Bare all-caps tokens count only when they
    are 2-5 letters and not in :data:`STOPLIST` (unless they are well-known
    tickers).
    """
    counts: Counter[str] = Counter()
    for match in _CASHTAG.finditer(text or ""):
        counts[match.group(1).upper()] += 1
    for match in _BARE.finditer(text or ""):
        token = match.group(1)
        if token in _ALWAYS_TICKERS or token not in STOPLIST:
            counts[token] += 1
    return dict(counts)


def detect_symbol_list(text: str) -> list[dict[str, int | str]]:
    """Detected symbols as a list of ``{"symbol", "mentions"}`` sorted by count."""
    counts = detect_symbols(text)
    return [
        {"symbol": sym, "mentions": n}
        for sym, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
