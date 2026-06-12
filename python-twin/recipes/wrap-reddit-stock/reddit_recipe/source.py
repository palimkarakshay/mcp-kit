"""The real PRAW-backed Reddit source.

``praw`` is imported lazily and only when a live source is constructed, so the
package imports (and tests) work without praw installed. Reddit API credentials
come from the **environment** (a transport concern), never a tool argument.
Install with the recipe's ``reddit`` extra (``pip install -e ".[reddit]"``).
"""

from __future__ import annotations

import os
from typing import Any

from mcp_kit_starter import McpToolError


def _normalise(submission: Any) -> dict[str, Any]:
    return {
        "id": getattr(submission, "id", None),
        "title": getattr(submission, "title", "") or "",
        "text": getattr(submission, "selftext", "") or "",
        "score": getattr(submission, "score", 0),
        "numComments": getattr(submission, "num_comments", 0),
        "url": getattr(submission, "url", None),
        "permalink": f"https://www.reddit.com{getattr(submission, 'permalink', '')}",
        "subreddit": str(getattr(submission, "subreddit", "")),
    }


class RedditSource:
    """Adapts ``praw.Reddit`` to the :class:`~.client.RedditSourceProtocol`."""

    def __init__(self) -> None:
        client_id = os.environ.get("REDDIT_CLIENT_ID")
        client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
        user_agent = os.environ.get("REDDIT_USER_AGENT")
        if not (client_id and client_secret and user_agent):
            raise McpToolError(
                "unauthorized",
                "Reddit is not configured. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and "
                "REDDIT_USER_AGENT in the environment.",
            )
        import praw  # lazy: only needed for live data

        self._reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
            check_for_async=False,
        )
        self._reddit.read_only = True

    def posts(self, subreddit: str, sort: str, limit: int) -> list[dict[str, Any]]:
        sub = self._reddit.subreddit(subreddit)
        listing = {
            "hot": sub.hot,
            "new": sub.new,
            "top": sub.top,
            "rising": sub.rising,
        }.get(sort, sub.hot)
        return [_normalise(s) for s in listing(limit=limit)]

    def search(self, query: str, subreddit: str | None, limit: int) -> list[dict[str, Any]]:
        sub = self._reddit.subreddit(subreddit or "all")
        return [_normalise(s) for s in sub.search(query, limit=limit)]
