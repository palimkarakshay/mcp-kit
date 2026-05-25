"""Structured errors for MCP tools.

A tool must never leak a raw stack trace or an opaque object back to the model
-- that is unusable documentation. Instead every failure is shaped into a stable
:class:`ErrorEnvelope`: a machine-readable ``code``, a human-readable
``message``, and a ``retryable`` flag the model can act on. The envelope is
returned as ``structuredContent`` alongside an ``isError=True`` tool result, so
the model sees both prose and structure.

This is the Python twin of ``../ts/src/errors.ts``.
"""

from __future__ import annotations

from typing import Any, Literal

from mcp.types import CallToolResult, TextContent

#: Stable, low-cardinality error codes. Add to this set deliberately.
ErrorCode = Literal[
    "invalid_input",
    "unauthorized",
    "not_found",
    "upstream_error",
    "upstream_unavailable",
    "timeout",
    "rate_limited",
    "internal",
]

# Whether retrying the same call could plausibly succeed, per code.
_DEFAULT_RETRYABLE: dict[str, bool] = {
    "invalid_input": False,
    "unauthorized": False,
    "not_found": False,
    "upstream_error": False,
    "upstream_unavailable": True,
    "timeout": True,
    "rate_limited": True,
    "internal": False,
}


class McpToolError(Exception):
    """An error a tool can raise to produce a well-formed error envelope.

    Raise this from a tool handler (or use a helper such as
    :func:`invalid_input`); the :func:`mcp_kit_starter.tool.wrap_handler`
    wrapper converts it into a structured :class:`~mcp.types.CallToolResult`.
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        *,
        retryable: bool | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.code: ErrorCode = code
        self.message = message
        self.retryable = (
            retryable if retryable is not None else _DEFAULT_RETRYABLE[code]
        )
        self.details = details

    def to_envelope(self) -> dict[str, Any]:
        error: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }
        if self.details is not None:
            error["details"] = self.details
        return {"error": error}


def invalid_input(message: str, details: Any | None = None) -> McpToolError:
    """The caller passed something the tool cannot accept. Not retryable."""
    return McpToolError("invalid_input", message, details=details)


def not_found(message: str, details: Any | None = None) -> McpToolError:
    """A referenced resource does not exist. Not retryable."""
    return McpToolError("not_found", message, details=details)


def upstream_error(
    message: str,
    *,
    retryable: bool | None = None,
    details: Any | None = None,
) -> McpToolError:
    """An upstream dependency returned an error response."""
    return McpToolError(
        "upstream_error", message, retryable=retryable, details=details
    )


def timeout(message: str, details: Any | None = None) -> McpToolError:
    """An operation exceeded its deadline. Retryable."""
    return McpToolError("timeout", message, retryable=True, details=details)


def _to_envelope(thrown: BaseException | object) -> dict[str, Any]:
    if isinstance(thrown, McpToolError):
        return thrown.to_envelope()
    if isinstance(thrown, BaseException):
        return {
            "error": {
                "code": "internal",
                "message": str(thrown),
                "retryable": False,
            }
        }
    return {
        "error": {"code": "internal", "message": str(thrown), "retryable": False}
    }


def _format_envelope(envelope: dict[str, Any]) -> str:
    error = envelope["error"]
    suffix = " (retryable)" if error["retryable"] else ""
    return f"[{error['code']}] {error['message']}{suffix}"


def error_result(thrown: BaseException | object) -> CallToolResult:
    """Convert any thrown value into a structured, model-safe tool result.

    Known :class:`McpToolError`\\ s pass through their envelope verbatim.
    Anything else is mapped to an ``internal`` error with only its message
    exposed -- never a stack trace, which would be noise (and a possible
    information leak) to the model.
    """
    envelope = _to_envelope(thrown)
    return CallToolResult(
        isError=True,
        content=[TextContent(type="text", text=_format_envelope(envelope))],
        structuredContent=envelope,
    )
