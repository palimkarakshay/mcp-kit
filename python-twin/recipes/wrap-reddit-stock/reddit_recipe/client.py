"""Reddit client: fetch posts and detect the stock symbols mentioned in them.

The PRAW source is injectable so tests run offline; symbol detection is the
pure function in :mod:`reddit_recipe.symbols`. Errors from praw are normalised
to the kit's structured :class:`~mcp_kit_starter.errors.McpToolError`.
"""

from __future__ import annotations

from typing import Any, Callable, Protocol

from mcp_kit_starter import McpToolError

from .symbols import detect_symbol_list, detect_symbols

_RATE_LIMIT_HINTS = ("ratelimit", "rate limit", "too many requests", "429")
_NOT_FOUND_HINTS = ("not found", "404", "redirect", "notfound")
_FORBIDDEN_HINTS = ("forbidden", "401", "403", "unauthorized")


class RedditSourceProtocol(Protocol):
    def posts(self, subreddit: str, sort: str, limit: int) -> list[dict[str, Any]]: ...
    def search(self, query: str, subreddit: str | None, limit: int) -> list[dict[str, Any]]: ...


class RedditClient:
    def __init__(self, *, source: RedditSourceProtocol | None = None) -> None:
        self._source = source

    def _src(self) -> RedditSourceProtocol:
        if self._source is None:
            from .source import RedditSource  # lazy: only here do we need praw + creds

            self._source = RedditSource()
        return self._source

    @staticmethod
    def _guard(fn: Callable[[], Any]) -> Any:
        try:
            return fn()
        except McpToolError:
            raise
        except Exception as exc:  # noqa: BLE001 -- normalise any praw/prawcore failure
            text = f"{type(exc).__name__} {exc}".lower()
            if any(h in text for h in _RATE_LIMIT_HINTS):
                raise McpToolError(
                    "rate_limited", "Reddit rate-limited the request; back off and retry.", retryable=True
                ) from exc
            if any(h in text for h in _FORBIDDEN_HINTS):
                raise McpToolError("unauthorized", f"Reddit refused the request: {exc}") from exc
            if any(h in text for h in _NOT_FOUND_HINTS):
                raise McpToolError("not_found", f"Reddit returned not-found: {exc}") from exc
            raise McpToolError("upstream_error", f"Reddit error: {exc}") from exc

    @staticmethod
    def _with_symbols(post: dict[str, Any]) -> dict[str, Any]:
        text = f"{post.get('title', '')} {post.get('text', '')}"
        return {**post, "symbols": detect_symbol_list(text)}

    def get_subreddit_posts(self, subreddit: str, sort: str = "hot", limit: int = 10) -> dict[str, Any]:
        posts = self._guard(lambda: self._src().posts(subreddit, sort, limit))
        return {
            "subreddit": subreddit,
            "sort": sort,
            "count": len(posts),
            "posts": [self._with_symbols(p) for p in posts],
        }

    def search_posts(self, query: str, subreddit: str | None = None, limit: int = 10) -> dict[str, Any]:
        posts = self._guard(lambda: self._src().search(query, subreddit, limit))
        return {
            "query": query,
            "subreddit": subreddit,
            "count": len(posts),
            "posts": [self._with_symbols(p) for p in posts],
        }

    def get_trending_symbols(self, subreddit: str, scan_limit: int = 50, sort: str = "hot") -> dict[str, Any]:
        posts = self._guard(lambda: self._src().posts(subreddit, sort, scan_limit))
        aggregate: dict[str, dict[str, Any]] = {}
        for post in posts:
            text = f"{post.get('title', '')} {post.get('text', '')}"
            for symbol, mentions in detect_symbols(text).items():
                entry = aggregate.setdefault(symbol, {"symbol": symbol, "mentions": 0, "posts": 0})
                entry["mentions"] += mentions
                entry["posts"] += 1
        ranked = sorted(aggregate.values(), key=lambda e: (-e["mentions"], e["symbol"]))
        return {
            "subreddit": subreddit,
            "postsScanned": len(posts),
            "count": len(ranked),
            "symbols": ranked,
        }
