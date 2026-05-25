"""Structured-error tests. Python twin of the TS `structured errors` suite."""

from __future__ import annotations

from mcp_kit_starter.errors import (
    McpToolError,
    error_result,
    invalid_input,
    timeout,
)


def test_invalid_input_maps_to_its_envelope() -> None:
    res = error_result(invalid_input("bad input", {"field": "timezone"}))
    assert res.isError is True
    error = res.structuredContent["error"]
    assert error["code"] == "invalid_input"
    assert error["retryable"] is False
    assert error["details"] == {"field": "timezone"}
    assert "bad input" in res.content[0].text


def test_invalid_input_default_retryable_is_false() -> None:
    assert invalid_input("x").retryable is False


def test_timeout_default_retryable_is_true() -> None:
    assert timeout("slow").retryable is True


def test_unknown_throwable_maps_to_internal_without_leaking() -> None:
    res = error_result("boom")
    error = res.structuredContent["error"]
    assert error["code"] == "internal"
    assert error["retryable"] is False
    assert error["message"] == "boom"


def test_generic_exception_maps_to_internal() -> None:
    res = error_result(RuntimeError("kaboom"))
    error = res.structuredContent["error"]
    assert error["code"] == "internal"
    assert error["message"] == "kaboom"
    assert "details" not in error


def test_envelope_omits_details_when_absent() -> None:
    env = McpToolError("internal", "x").to_envelope()
    assert "details" not in env["error"]
