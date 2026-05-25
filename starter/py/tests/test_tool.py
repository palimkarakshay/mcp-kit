"""Direct unit tests of the example tool's handler and the wrap_handler logic."""

from __future__ import annotations

import re

from mcp_kit_starter.tool import ToolSpec, wrap_handler
from mcp_kit_starter.tools.get_current_time import _handler


def test_handler_utc_iso_shape() -> None:
    out = _handler("UTC", "iso")
    assert out["timezone"] == "UTC"
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", out["localTime"])
    assert re.match(r"^\d{4}-\d{2}-\d{2}T.*Z$", out["utcIso"])
    assert isinstance(out["unixMs"], int)


def test_handler_defaults_to_utc_iso() -> None:
    out = _handler()
    assert out["timezone"] == "UTC"
    assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", out["localTime"])


def test_handler_human_format_is_long_and_readable() -> None:
    out = _handler("Asia/Tokyo", "human")
    # Long form contains a weekday and a year; not the sortable iso form.
    assert not re.match(r"^\d{4}-\d{2}-\d{2} ", out["localTime"])
    assert any(d in out["localTime"] for d in
               ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"])


def test_handler_unknown_timezone_raises_invalid_input() -> None:
    from mcp_kit_starter.errors import McpToolError

    try:
        _handler("Not/ARealZone", "iso")
    except McpToolError as err:
        assert err.code == "invalid_input"
        assert err.retryable is False
        assert err.details == {"timezone": "Not/ARealZone"}
    else:  # pragma: no cover
        raise AssertionError("expected McpToolError")


def test_wrap_handler_success_returns_structured_call_tool_result() -> None:
    spec = ToolSpec(
        name="t",
        handler=lambda **kw: {"ok": True},
        description="d",
        input_schema={"type": "object"},
        text_summary=lambda p: "summary",
    )
    result = wrap_handler(spec)()
    assert result.isError is False
    assert result.structuredContent == {"ok": True}
    assert result.content[0].text == "summary"


def test_wrap_handler_catches_exceptions_into_envelope() -> None:
    def boom(**_kw: object) -> dict:
        raise ValueError("nope")

    spec = ToolSpec(
        name="t",
        handler=boom,
        description="d",
        input_schema={"type": "object"},
    )
    result = wrap_handler(spec)()
    assert result.isError is True
    assert result.structuredContent["error"]["code"] == "internal"
