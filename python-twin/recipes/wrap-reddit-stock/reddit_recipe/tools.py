"""Reddit stock tools — one MCP server over PRAW with stock-symbol detection.

Three tools: get_subreddit_posts, search_posts, get_trending_symbols. Each
attaches the stock tickers detected in post text (see reddit_recipe.symbols).
The client is built lazily; tests inject one via :func:`set_reddit_client`.

Targeted at the dumbest-investor / thesis-tracker `sources/` adapters, and based
on the symbol-detection pattern in maoramsallem/reddit-mcp-server
(https://github.com/maoramsallem/reddit-mcp-server).
"""

from __future__ import annotations

from typing import Any

from mcp.types import ToolAnnotations

from mcp_kit_starter import ToolExample, ToolSpec, define_tool

from .client import RedditClient

_injected: RedditClient | None = None


def set_reddit_client(client: RedditClient | None) -> None:
    """Override the client (tests)."""
    global _injected
    _injected = client


def _reddit() -> RedditClient:
    global _injected
    if _injected is None:
        _injected = RedditClient()
    return _injected


def _get_subreddit_posts_handler(subreddit: str, sort: str = "hot", limit: int = 10) -> dict[str, Any]:
    return _reddit().get_subreddit_posts(subreddit, sort, limit)


def _search_posts_handler(query: str, subreddit: str | None = None, limit: int = 10) -> dict[str, Any]:
    return _reddit().search_posts(query, subreddit, limit)


def _get_trending_symbols_handler(subreddit: str, scan_limit: int = 50, sort: str = "hot") -> dict[str, Any]:
    return _reddit().get_trending_symbols(subreddit, scan_limit, sort)


_POST_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": ["string", "null"]},
        "title": {"type": "string"},
        "score": {"type": "number"},
        "numComments": {"type": "number"},
        "permalink": {"type": "string"},
        "symbols": {"type": "array", "items": {"type": "object"}},
    },
}


_get_subreddit_posts = define_tool(
    ToolSpec(
        name="get_subreddit_posts",
        title="Get subreddit posts with detected tickers",
        description=(
            "Get recent posts from a subreddit and the stock tickers mentioned in each. "
            "Use this when you want the latest discussion in an investing subreddit (e.g. wallstreetbets, stocks) "
            "with the cashtags/tickers already extracted per post — pick a sort (hot/new/top/rising) and a limit. "
            "It does not post or comment, does not return full comment threads, and the symbol detection is heuristic "
            "(cashtags are reliable; bare all-caps are filtered against a stoplist). "
            "Part of the wrap-reddit-stock server (a Reddit/PRAW wrapper), not a primitive. "
            'Example: get_subreddit_posts({ "subreddit": "wallstreetbets", "sort": "hot", "limit": 10 }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "subreddit": {"type": "string", "description": 'Subreddit name without the r/, e.g. "stocks".'},
                "sort": {
                    "type": "string",
                    "enum": ["hot", "new", "top", "rising"],
                    "default": "hot",
                    "description": 'Listing to read. Defaults to "hot".',
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "default": 10,
                    "description": "How many posts to fetch (1-100). Defaults to 10.",
                },
            },
            "required": ["subreddit"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "subreddit": {"type": "string"},
                "sort": {"type": "string"},
                "count": {"type": "number"},
                "posts": {"type": "array", "items": _POST_ITEM_SCHEMA},
            },
            "required": ["subreddit", "sort", "count", "posts"],
            "additionalProperties": False,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[
            ToolExample(description="Hot posts in r/stocks.", arguments={"subreddit": "stocks", "limit": 10})
        ],
        handler=_get_subreddit_posts_handler,
        text_summary=lambda p: f'{p["count"]} post(s) from r/{p["subreddit"]} ({p["sort"]}).',
    )
)


_search_posts = define_tool(
    ToolSpec(
        name="search_posts",
        title="Search Reddit posts with detected tickers",
        description=(
            "Search Reddit for posts matching a query and return them with detected stock tickers. "
            "Use this when you want posts about a specific topic or ticker across a subreddit (or all of Reddit) "
            "rather than a subreddit's front page — e.g. search \"NVDA earnings\" in r/stocks. "
            "It does not post or comment and does not return full comment threads; symbol detection is heuristic. "
            "Part of the wrap-reddit-stock server (a Reddit/PRAW wrapper), not a primitive. "
            'Example: search_posts({ "query": "NVDA earnings", "subreddit": "stocks", "limit": 10 }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": 'Full-text search query, e.g. "NVDA earnings".'},
                "subreddit": {
                    "type": "string",
                    "description": 'Subreddit to search within. Omit to search all of Reddit ("all").',
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "default": 10,
                    "description": "How many results to fetch (1-100). Defaults to 10.",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "subreddit": {"type": ["string", "null"]},
                "count": {"type": "number"},
                "posts": {"type": "array", "items": _POST_ITEM_SCHEMA},
            },
            "required": ["query", "count", "posts"],
            "additionalProperties": False,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[
            ToolExample(description="Search r/stocks for NVDA earnings.", arguments={"query": "NVDA earnings", "subreddit": "stocks"})
        ],
        handler=_search_posts_handler,
        text_summary=lambda p: f'{p["count"]} result(s) for "{p["query"]}".',
    )
)


_get_trending_symbols = define_tool(
    ToolSpec(
        name="get_trending_symbols",
        title="Get trending tickers in a subreddit",
        description=(
            "Scan a subreddit's recent posts and rank the most-mentioned stock tickers. "
            "Use this to gauge what a community is talking about right now — it reads up to scan_limit posts, detects "
            "tickers in each, and returns symbols ranked by total mentions and by how many posts mentioned them. "
            "It does not read comments (titles + selftext only) and the detection is heuristic, so treat it as a "
            "signal, not ground truth; it does not give prices or news (see the wrap-yfinance recipe for those). "
            "Part of the wrap-reddit-stock server (a Reddit/PRAW wrapper), not a primitive. "
            'Example: get_trending_symbols({ "subreddit": "wallstreetbets", "scan_limit": 50 }).'
        ),
        input_schema={
            "type": "object",
            "properties": {
                "subreddit": {"type": "string", "description": 'Subreddit to scan, e.g. "wallstreetbets".'},
                "scan_limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 200,
                    "default": 50,
                    "description": "How many recent posts to scan for tickers (1-200). Defaults to 50.",
                },
                "sort": {
                    "type": "string",
                    "enum": ["hot", "new", "top", "rising"],
                    "default": "hot",
                    "description": 'Which listing to scan. Defaults to "hot".',
                },
            },
            "required": ["subreddit"],
            "additionalProperties": False,
        },
        output_schema={
            "type": "object",
            "properties": {
                "subreddit": {"type": "string"},
                "postsScanned": {"type": "number"},
                "count": {"type": "number"},
                "symbols": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["subreddit", "postsScanned", "count", "symbols"],
            "additionalProperties": False,
        },
        annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True),
        examples=[
            ToolExample(description="Trending tickers in r/wallstreetbets.", arguments={"subreddit": "wallstreetbets", "scan_limit": 50})
        ],
        handler=_get_trending_symbols_handler,
        text_summary=lambda p: f'{p["count"]} ticker(s) across {p["postsScanned"]} post(s) in r/{p["subreddit"]}.',
    )
)


tools: list[ToolSpec] = [_get_subreddit_posts, _search_posts, _get_trending_symbols]

__all__ = ["tools", "set_reddit_client"]
