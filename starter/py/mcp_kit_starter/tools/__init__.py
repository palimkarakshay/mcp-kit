"""The starter's tool registry.

Recipes export their own list of the same shape; tests and tooling discover all
of them. Python twin of ``../ts/src/starter.tools.ts``.
"""

from __future__ import annotations

from ..tool import ToolSpec
from .get_current_time import get_current_time

tools: list[ToolSpec] = [get_current_time]

__all__ = ["tools", "get_current_time"]
