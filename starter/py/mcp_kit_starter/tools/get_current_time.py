"""The starter's one example tool.

It is deliberately small but shows every habit the rest of the kit relies on: a
verb-first name, a description that says when to use it *and* what it will not
do, fully-described parameters, worked examples, an output schema, read-only
annotations, structured-error failure -- and **no credentials in the input**
(the time zone is data, not a secret).

This is the Python twin of ``../ts/src/tools/get-current-time.ts``.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from mcp.types import ToolAnnotations

from ..errors import invalid_input
from ..tool import ToolExample, ToolSpec, define_tool

_UTC = timezone.utc

_DESCRIPTION = (
    "Return the current date and time in a given IANA time zone. "
    "Use this when you need the wall-clock time right now -- to timestamp an "
    "action, work out what 'today' is, or render a local time for the user. "
    "It does not parse or convert arbitrary timestamps you already have, do "
    "date arithmetic, or schedule anything in the future; it only reports the "
    "present instant. "
    'Example: get_current_time({ "timezone": "Asia/Tokyo", "format": "human" }).'
)

_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "timezone": {
            "type": "string",
            "default": "UTC",
            "description": (
                'IANA time-zone name such as "America/New_York" or '
                '"Asia/Kolkata". A numeric offset like "+05:30" is not '
                'accepted. Defaults to "UTC".'
            ),
        },
        "format": {
            "type": "string",
            "enum": ["iso", "human"],
            "default": "iso",
            "description": (
                'How to render localTime: "iso" gives a sortable '
                '"YYYY-MM-DD HH:MM:SS" form, "human" gives a long readable '
                'form. Defaults to "iso".'
            ),
        },
    },
    "additionalProperties": False,
}

_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "timezone": {
            "type": "string",
            "description": "The IANA zone the time was rendered in.",
        },
        "localTime": {
            "type": "string",
            "description": "Wall-clock time in that zone, per the requested format.",
        },
        "utcIso": {
            "type": "string",
            "description": "The same instant as an ISO-8601 UTC string.",
        },
        "unixMs": {
            "type": "number",
            "description": "Milliseconds since the Unix epoch.",
        },
    },
    "required": ["timezone", "localTime", "utcIso", "unixMs"],
    "additionalProperties": False,
}

# Long, readable English form, e.g. "Tuesday, March 4, 2025 at 7:08:09 AM JST".
_HUMAN_FORMAT = "%A, %B %-d, %Y at %-I:%M:%S %p %Z"


def _utc_iso(now: datetime) -> str:
    """ISO-8601 in UTC with a trailing ``Z`` (mirrors JS ``toISOString``)."""
    millis = now.microsecond // 1000
    return now.strftime("%Y-%m-%dT%H:%M:%S") + f".{millis:03d}Z"


def _handler(timezone: str = "UTC", format: str = "iso") -> dict[str, Any]:
    # Capture the instant once, then render it in the requested zone.
    instant = datetime.now(tz=_UTC)

    try:
        zone = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError, KeyError, ModuleNotFoundError):
        raise invalid_input(
            f'Unknown IANA time zone: "{timezone}".', {"timezone": timezone}
        )

    local = instant.astimezone(zone)
    if format == "human":
        local_time = local.strftime(_HUMAN_FORMAT)
    else:
        # Sortable "YYYY-MM-DD HH:MM:SS" local wall-clock.
        local_time = local.strftime("%Y-%m-%d %H:%M:%S")

    return {
        "timezone": timezone,
        "localTime": local_time,
        "utcIso": _utc_iso(instant),
        "unixMs": int(instant.timestamp() * 1000),
    }


def _summary(payload: dict[str, Any]) -> str:
    return f"{payload['localTime']} ({payload['timezone']})"


get_current_time: ToolSpec = define_tool(
    ToolSpec(
        name="get_current_time",
        title="Get current time",
        description=_DESCRIPTION,
        input_schema=_INPUT_SCHEMA,
        output_schema=_OUTPUT_SCHEMA,
        annotations=ToolAnnotations(
            readOnlyHint=True, openWorldHint=False, idempotentHint=True
        ),
        examples=[
            ToolExample(
                description="Current time in UTC, ISO style (the defaults).",
                arguments={},
            ),
            ToolExample(
                description="Current time in Tokyo, human-readable.",
                arguments={"timezone": "Asia/Tokyo", "format": "human"},
            ),
        ],
        handler=_handler,
        text_summary=_summary,
    )
)
