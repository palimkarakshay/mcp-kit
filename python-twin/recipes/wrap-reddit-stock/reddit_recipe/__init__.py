"""wrap-reddit-stock — a Python MCP recipe wrapping PRAW with ticker detection.

Exposes get_subreddit_posts / search_posts / get_trending_symbols as one MCP
server, attaching detected stock symbols to posts, built on the
``mcp-kit-starter`` base. Runnable via ``python -m reddit_recipe.cli`` (needs the
``reddit`` extra and Reddit API credentials in the environment).
"""

from __future__ import annotations

from .client import RedditClient
from .server import build_server
from .symbols import detect_symbols
from .tools import set_reddit_client, tools

__all__ = ["RedditClient", "build_server", "tools", "set_reddit_client", "detect_symbols"]
