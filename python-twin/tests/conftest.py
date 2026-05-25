"""Shared pytest fixtures.

Pin anyio's backend to asyncio so the in-memory client/server tests run on the
stdlib loop without requiring trio.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
