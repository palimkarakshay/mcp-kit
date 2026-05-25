"""Tests for the Reddit-stock recipe, with a fake source injected — no network,
no praw or Reddit credentials needed.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from reddit_recipe.client import RedditClient
from reddit_recipe.server import build_server
from reddit_recipe.symbols import detect_symbols
from reddit_recipe.tools import set_reddit_client

_POSTS = [
    {
        "id": "1",
        "title": "$TSLA to the moon",
        "text": "loading up on TSLA and NVDA",
        "score": 100,
        "numComments": 5,
        "url": "u1",
        "permalink": "https://www.reddit.com/r/wallstreetbets/1",
        "subreddit": "wallstreetbets",
    },
    {
        "id": "2",
        "title": "Thoughts on NVDA?",
        "text": "NVDA earnings soon. THE CEO said stuff.",
        "score": 50,
        "numComments": 2,
        "url": "u2",
        "permalink": "https://www.reddit.com/r/wallstreetbets/2",
        "subreddit": "wallstreetbets",
    },
]


class FakeSource:
    def __init__(self, posts: list[dict[str, Any]]) -> None:
        self._posts = posts

    def posts(self, subreddit: str, sort: str, limit: int) -> list[dict[str, Any]]:
        return self._posts[:limit]

    def search(self, query: str, subreddit: str | None, limit: int) -> list[dict[str, Any]]:
        q = query.lower()
        return [p for p in self._posts if q in f"{p['title']} {p['text']}".lower()][:limit]


@pytest.fixture
def fake_reddit() -> Iterator[None]:
    set_reddit_client(RedditClient(source=FakeSource(_POSTS)))
    try:
        yield
    finally:
        set_reddit_client(None)


def test_detect_symbols_keeps_cashtags_and_filters_stopwords() -> None:
    found = detect_symbols("$TSLA and AAPL, the CEO loves NVDA")
    assert found["TSLA"] == 2  # cashtag + bare
    assert found["AAPL"] == 1
    assert found["NVDA"] == 1
    assert "CEO" not in found  # stoplisted


@pytest.mark.anyio
async def test_get_subreddit_posts_attaches_symbols(fake_reddit: None) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("get_subreddit_posts", {"subreddit": "wallstreetbets", "limit": 10})
        assert not res.isError
        sc = res.structuredContent
        assert sc["count"] == 2
        first_symbols = {s["symbol"] for s in sc["posts"][0]["symbols"]}
        assert "TSLA" in first_symbols


@pytest.mark.anyio
async def test_search_posts_filters_by_query(fake_reddit: None) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("search_posts", {"query": "earnings", "subreddit": "wallstreetbets"})
        assert not res.isError
        assert res.structuredContent["count"] == 1
        assert res.structuredContent["posts"][0]["id"] == "2"


@pytest.mark.anyio
async def test_get_trending_symbols_ranks_by_mentions(fake_reddit: None) -> None:
    async with create_connected_server_and_client_session(build_server()) as client:
        res = await client.call_tool("get_trending_symbols", {"subreddit": "wallstreetbets", "scan_limit": 50})
        assert not res.isError
        sc = res.structuredContent
        assert sc["postsScanned"] == 2
        top = sc["symbols"][0]
        assert top["symbol"] == "NVDA"  # 1 (post1) + 2 (post2) = 3 mentions, in 2 posts
        assert top["mentions"] == 3
        assert top["posts"] == 2


@pytest.mark.anyio
async def test_rate_limit_becomes_structured_error() -> None:
    class RateLimited(FakeSource):
        def posts(self, subreddit: str, sort: str, limit: int) -> list[dict[str, Any]]:
            raise RuntimeError("RateLimitExceeded: Too Many Requests")

    set_reddit_client(RedditClient(source=RateLimited(_POSTS)))
    try:
        async with create_connected_server_and_client_session(build_server()) as client:
            res = await client.call_tool("get_subreddit_posts", {"subreddit": "wallstreetbets"})
            assert res.isError is True
            error = res.structuredContent["error"]
            assert error["code"] == "rate_limited"
            assert error["retryable"] is True
    finally:
        set_reddit_client(None)
