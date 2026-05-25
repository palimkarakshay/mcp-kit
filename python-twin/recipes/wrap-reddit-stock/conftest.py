"""Make ``reddit_recipe`` importable for this recipe's tests and pin anyio."""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
