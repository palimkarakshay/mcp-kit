"""The tool helper.

A :class:`ToolSpec` is the single source of truth for a tool: its name,
description, input schema, annotations and worked examples. Keeping one object
means the thing the model reads and the thing tests assert against can never
drift apart.

This is the Python twin of ``../starter/src/tool.py``. Because the tool returns a
fully-formed :class:`~mcp.types.CallToolResult` (so a failure can carry both
``isError=True`` and a structured error envelope), the success output schema is
declared here on the :class:`ToolSpec` and attached to the registered tool so it
is still advertised to clients.
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.types import CallToolResult, TextContent, ToolAnnotations

from .errors import error_result


@dataclass(frozen=True)
class ToolExample:
    """A worked example: what calling the tool with these arguments shows."""

    description: str
    arguments: dict[str, Any]


@dataclass
class ToolSpec:
    """A complete tool definition.

    Attributes:
        name: Verb-first, ``snake_case``, unique within the server.
        handler: Runs when the tool is called. Raise
            :class:`~mcp_kit_starter.errors.McpToolError` for clean failures;
            return a ``dict`` of structured content on success (it will be
            wrapped into a :class:`~mcp.types.CallToolResult`).
        description: The model's documentation. A good one names what it
            operates on, a "Use this when ..." sentence, and what it does *not*
            handle.
        input_schema: JSON Schema for the tool's parameters.
        output_schema: JSON Schema for ``structuredContent`` on success.
        text_summary: Optional callable turning a success payload into the
            human-readable ``content`` text block.
    """

    name: str
    handler: Callable[..., dict[str, Any]]
    description: str
    input_schema: dict[str, Any]
    title: str | None = None
    output_schema: dict[str, Any] | None = None
    annotations: ToolAnnotations | None = None
    examples: list[ToolExample] = field(default_factory=list)
    text_summary: Callable[[dict[str, Any]], str] | None = None


def define_tool(spec: ToolSpec) -> ToolSpec:
    """Identity helper -- authoring sugar, mirroring TS ``defineTool``."""
    return spec


def _success_result(spec: ToolSpec, payload: dict[str, Any]) -> CallToolResult:
    text = spec.text_summary(payload) if spec.text_summary else None
    content = [TextContent(type="text", text=text)] if text is not None else []
    return CallToolResult(
        isError=False,
        content=content,
        structuredContent=payload,
    )


def wrap_handler(
    spec: ToolSpec,
) -> Callable[..., CallToolResult]:
    """Wrap a handler so any raised value becomes a structured error result.

    This is what makes "just ``raise invalid_input(...)``" the ergonomic,
    correct way to fail: the request never crashes, and the model always sees a
    stable envelope.
    """

    @functools.wraps(spec.handler)
    def wrapped(**kwargs: Any) -> CallToolResult:
        try:
            payload = spec.handler(**kwargs)
            return _success_result(spec, payload)
        except Exception as err:  # noqa: BLE001 -- deliberately catch-all
            return error_result(err)

    # The function's return annotation drives FastMCP's output handling. A bare
    # CallToolResult annotation means "return verbatim, no schema validation",
    # which is exactly what we want so error envelopes pass through untouched.
    wrapped.__annotations__ = {"return": CallToolResult}
    return wrapped


def register_tool(server: FastMCP, spec: ToolSpec) -> None:
    """Register a single :class:`ToolSpec` on a FastMCP server."""
    handler = wrap_handler(spec)
    # FastMCP derives the input schema from the function signature; we override
    # both input and output schema with the spec's hand-written JSON Schema.
    server.add_tool(
        handler,
        name=spec.name,
        title=spec.title,
        description=spec.description,
        annotations=spec.annotations,
    )
    tool = server._tool_manager.get_tool(spec.name)
    if tool is not None:
        tool.parameters = spec.input_schema
        # ``output_schema`` is a cached_property reading fn_metadata; set the
        # backing field before first access so list_tools advertises it.
        tool.fn_metadata.output_schema = spec.output_schema


def register_tools(server: FastMCP, specs: list[ToolSpec]) -> None:
    """Register many specs at once."""
    for spec in specs:
        register_tool(server, spec)
